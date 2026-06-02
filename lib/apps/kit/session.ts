import type {
  AppDef,
  AppState,
  FieldValue,
  LiveAppEvent,
  PendingAction,
} from "./types";
import { getAppDef, defaultState } from "./registry";
import { writeArtifact } from "./mcp-fs";

const SESSION_KEY = Symbol.for("liveapp.sessions");
type GlobalWithSessions = typeof globalThis & {
  [SESSION_KEY]?: Map<string, LiveAppSession>;
};
const g = globalThis as GlobalWithSessions;
const SESSIONS: Map<string, LiveAppSession> =
  g[SESSION_KEY] ?? (g[SESSION_KEY] = new Map());

export function createLiveApp(appId: string): LiveAppSession | null {
  const def = getAppDef(appId);
  if (!def) return null;
  const id = `${appId}-${Math.random().toString(36).slice(2, 10)}`;
  const s = new LiveAppSession(id, def);
  SESSIONS.set(id, s);
  return s;
}
export function getLiveApp(id: string): LiveAppSession | undefined {
  return SESSIONS.get(id);
}

type Subscriber = (ev: LiveAppEvent) => void;

export class LiveAppSession {
  readonly sessionId: string;
  private def: AppDef;
  private state: AppState;
  private subscribers = new Set<Subscriber>();
  private buffer: LiveAppEvent[] = [];
  private pending: PendingAction | null = null;
  private liveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(sessionId: string, def: AppDef) {
    this.sessionId = sessionId;
    this.def = def;
    this.state = defaultState(def);
  }

  subscribe(cb: Subscriber): () => void {
    this.subscribers.add(cb);
    for (const ev of this.buffer) cb(ev);
    this.startLive();
    return () => {
      this.subscribers.delete(cb);
      if (this.subscribers.size === 0) this.stopLive();
    };
  }

  private emit(ev: LiveAppEvent) {
    this.buffer.push(ev);
    if (this.buffer.length > 200) this.buffer.splice(0, this.buffer.length - 200);
    for (const s of this.subscribers) {
      try {
        s(ev);
      } catch {
        /* ignore */
      }
    }
  }

  emitSnapshot() {
    this.emit({ type: "session_ready", sessionId: this.sessionId, appId: this.def.id });
    this.pushState();
    if (this.pending) this.emit({ type: "action_pending", pending: this.pending });
  }

  // engine → UI: deterministic compute, pushed back without a new turn
  private pushState() {
    const r = this.def.compute(this.state);
    this.emit({
      type: "state",
      payload: {
        values: { ...this.state },
        metrics: r.metrics,
        note: r.note ?? null,
        trigger: r.trigger ?? null,
      },
    });
  }

  // UI → engine
  setField(key: string, value: FieldValue) {
    if (!this.def.fields.some((f) => f.key === key)) return;
    this.state[key] = value;
    this.pushState();
  }

  // batch apply (sample scenarios) — one push instead of N
  setFields(values: AppState) {
    let changed = false;
    for (const [key, value] of Object.entries(values)) {
      if (this.def.fields.some((f) => f.key === key)) {
        this.state[key] = value;
        changed = true;
      }
    }
    if (changed) this.pushState();
  }

  // engine → real world (approval-gated)
  runAction(): boolean {
    if (this.pending) return false;
    const r = this.def.compute(this.state);
    this.pending = {
      actionId: `act-${Math.random().toString(36).slice(2, 8)}`,
      title: this.def.action.confirmTitle,
      body: this.def.action.confirmBody(this.state, r.metrics),
    };
    this.emit({ type: "action_pending", pending: this.pending });
    return true;
  }

  async resolveAction(actionId: string, approve: boolean) {
    if (!this.pending || this.pending.actionId !== actionId) return;
    this.pending = null;
    if (!approve) {
      this.emit({ type: "action_result", result: { actionId, ok: false, message: "Cancelled by user." } });
      return;
    }
    this.emit({ type: "action_running", actionId });
    const r = this.def.compute(this.state);
    const verdict = await this.def.action.run(this.state, r.metrics);

    // engine → real world: if the action produced an artifact, write it for
    // real through the MCP filesystem server.
    let artifactPath: string | undefined;
    let ok = verdict.ok;
    let message = verdict.message;
    if (verdict.ok && verdict.artifact) {
      const w = await writeArtifact(this.def.id, verdict.artifact.filename, verdict.artifact.content);
      if (w.ok) {
        artifactPath = w.relPath;
        message = `${verdict.message} · wrote ${w.relPath}`;
      } else {
        ok = false;
        message = `Action computed but the file write failed: ${w.error ?? "unknown error"}`;
      }
    }

    this.emit({ type: "action_result", result: { actionId, ok, message, artifactPath } });
    this.pushState();
  }

  // optional live streaming (Pulsedash) — engine→UI continuous push
  private startLive() {
    if (this.liveTimer || !this.def.live) return;
    const live = this.def.live;
    this.liveTimer = setInterval(() => {
      const prev = typeof this.state[live.stateKey] === "number" ? (this.state[live.stateKey] as number) : live.initial;
      this.state[live.stateKey] = live.next(prev);
      this.pushState();
    }, live.intervalMs);
  }
  private stopLive() {
    if (this.liveTimer) {
      clearInterval(this.liveTimer);
      this.liveTimer = null;
    }
  }
}
