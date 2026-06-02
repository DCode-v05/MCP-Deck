import {
  type ApprovalVerdict,
  type McpDeckEvent,
  type McpResourceNode,
  type McpServerInfo,
  type McpServerState,
  type McpToolInfo,
  type McpToolState,
  type PendingApproval,
  type ReplayEntry,
  type ServerUsage,
  type SessionSnapshot,
  type UsageStats,
} from "./types";
import { mockProvider, type McpProvider } from "./provider";

const PLAN_NAME = "McpDeck Pro (demo)";
const REQUEST_QUOTA = 100;

// Hoist into globalThis so Next.js HMR doesn't drop running sessions on reload.
const SESSION_KEY = Symbol.for("mcpdeck.sessions");
type GlobalWithSessions = typeof globalThis & {
  [SESSION_KEY]?: Map<string, McpDeckSession>;
};
const globalRef = globalThis as GlobalWithSessions;
const SESSIONS: Map<string, McpDeckSession> =
  globalRef[SESSION_KEY] ?? (globalRef[SESSION_KEY] = new Map());

export function createSession(provider: McpProvider = mockProvider): McpDeckSession {
  const id = makeId("ses");
  const s = new McpDeckSession(id, provider);
  SESSIONS.set(id, s);
  return s;
}

export function getSession(id: string): McpDeckSession | undefined {
  return SESSIONS.get(id);
}

export function dropSession(id: string): void {
  const s = SESSIONS.get(id);
  if (s) s.dispose();
  SESSIONS.delete(id);
}

type Subscriber = (ev: McpDeckEvent) => void;

export class McpDeckSession {
  readonly sessionId: string;
  readonly provider: McpProvider;
  goal: string | null = null;
  status: SessionSnapshot["status"] = "idle";

  private servers: Map<string, McpServerState> = new Map();
  private tools: Map<string, McpToolState> = new Map();
  private resources: Map<string, McpResourceNode> = new Map();
  private replay: ReplayEntry[] = [];
  private pending: Map<string, PendingApproval> = new Map();
  private resolvers: Map<string, (v: ApprovalVerdict) => void> = new Map();
  private remembered: Set<string> = new Set();
  private log: Array<{ level: "info" | "warn" | "error"; message: string; ts: number }> = [];
  private subscribers: Set<Subscriber> = new Set();
  private buffer: McpDeckEvent[] = [];
  private disposed = false;
  private stopRequested = false;

  // --- usage / subscription accounting ---
  private usage: UsageStats;
  private serverUsage: Map<string, ServerUsage> = new Map();

  constructor(sessionId: string, provider: McpProvider = mockProvider) {
    this.sessionId = sessionId;
    this.provider = provider;
    const now = Date.now();
    for (const s of provider.servers) {
      this.serverUsage.set(s.id, {
        serverId: s.id,
        requests: 0,
        errors: 0,
        bytes: 0,
        lastActivityAt: null,
      });
    }
    this.usage = {
      plan: PLAN_NAME,
      requestQuota: REQUEST_QUOTA,
      inputTokens: 0,
      outputTokens: 0,
      totalCost: 0,
      iterations: 0,
      toolInvocations: 0,
      approvals: 0,
      denials: 0,
      byServer: [...this.serverUsage.values()],
      startedAt: now,
      updatedAt: now,
    };
    for (const s of provider.servers) {
      this.servers.set(s.id, {
        id: s.id,
        enabled: true,
        health: "ok",
        lastPingAt: Date.now(),
        latencyMs: s.latencyMs,
      });
    }
    for (const t of provider.tools) {
      this.tools.set(t.id, {
        id: t.id,
        pinned: false,
        invocationCount: 0,
        lastInvokedAt: null,
        lastResultPreview: null,
        lastIsError: false,
      });
    }
    for (const n of provider.initialResources) this.resources.set(n.id, n);
  }

  // --- provider accessors (used by the engine) ---
  serverInfos(): McpServerInfo[] {
    return this.provider.servers;
  }
  toolInfos(): McpToolInfo[] {
    return this.provider.tools;
  }
  findServerInfo(id: string): McpServerInfo | undefined {
    return this.provider.findServer(id);
  }
  findToolInfo(id: string): McpToolInfo | undefined {
    return this.provider.findTool(id);
  }
  callTool(toolId: string, args: Record<string, unknown>): Promise<{ result: string; isError: boolean }> {
    return this.provider.callTool(toolId, args);
  }

  // --- subscription ---
  subscribe(cb: Subscriber): () => void {
    this.subscribers.add(cb);
    // Replay buffered events to late subscribers so reloads pick up state.
    for (const ev of this.buffer) cb(ev);
    // Start the health-ping loop while at least one client is watching.
    this.startPingLoop();
    return () => {
      this.subscribers.delete(cb);
      if (this.subscribers.size === 0) this.stopPingLoop();
    };
  }

  // --- live server pings ---
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  private startPingLoop(): void {
    if (this.pingTimer || this.disposed) return;
    this.pingTimer = setInterval(() => this.pingTick(), 5000);
  }

  private stopPingLoop(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private pingTick(): void {
    for (const s of this.servers.values()) {
      if (!s.enabled) continue;
      const base = this.provider.findServer(s.id)?.latencyMs ?? 50;
      // Jitter around the server's nominal latency; occasionally degrade.
      const jitter = Math.round((Math.random() - 0.4) * base * 0.6);
      s.latencyMs = Math.max(4, base + jitter);
      const roll = Math.random();
      s.health = roll > 0.94 ? "degraded" : "ok";
      s.lastPingAt = Date.now();
      this.emit({ type: "server_state", state: { ...s } });
    }
  }

  emit(ev: McpDeckEvent): void {
    if (this.disposed) return;
    this.buffer.push(ev);
    // Trim buffer to keep memory bounded.
    if (this.buffer.length > 500) this.buffer.splice(0, this.buffer.length - 500);
    for (const s of this.subscribers) {
      try {
        s(ev);
      } catch {
        // ignore subscriber failures so one bad sink doesn't break the loop
      }
    }
  }

  logEvent(level: "info" | "warn" | "error", message: string): void {
    const entry = { level, message, ts: Date.now() };
    this.log.push(entry);
    if (this.log.length > 200) this.log.splice(0, this.log.length - 200);
    this.emit({ type: "log", level, message });
  }

  // --- snapshot ---
  snapshot(): SessionSnapshot {
    return {
      sessionId: this.sessionId,
      goal: this.goal,
      status: this.status,
      servers: [...this.servers.values()],
      tools: [...this.tools.values()],
      resources: [...this.resources.values()],
      replay: [...this.replay],
      pendingApprovals: [...this.pending.values()],
      log: [...this.log],
      usage: this.usageSnapshot(),
    };
  }

  emitSnapshot(): void {
    this.emit({ type: "session_ready", sessionId: this.sessionId });
    for (const s of this.servers.values()) this.emit({ type: "server_state", state: s });
    for (const t of this.tools.values()) this.emit({ type: "tool_state", state: t });
    this.emit({ type: "resource_tree", nodes: [...this.resources.values()] });
    for (const p of this.pending.values()) this.emit({ type: "approval_pending", pending: p });
    this.emit({ type: "usage_state", usage: this.usageSnapshot() });
  }

  // --- usage / subscription accounting ---
  private usageSnapshot(): UsageStats {
    return {
      ...this.usage,
      byServer: [...this.serverUsage.values()].map((u) => ({ ...u })),
      updatedAt: Date.now(),
    };
  }

  private emitUsage(): void {
    this.usage.updatedAt = Date.now();
    this.emit({ type: "usage_state", usage: this.usageSnapshot() });
  }

  recordEngineUsage(inputTokens: number, outputTokens: number, totalCost: number): void {
    this.usage.inputTokens = inputTokens;
    this.usage.outputTokens = outputTokens;
    this.usage.totalCost = totalCost;
    this.emitUsage();
  }

  recordIteration(): void {
    this.usage.iterations += 1;
    this.emitUsage();
  }

  private recordServerActivity(serverId: string, bytes: number, isError: boolean): void {
    const u = this.serverUsage.get(serverId);
    if (!u) return;
    u.requests += 1;
    u.bytes += bytes;
    if (isError) u.errors += 1;
    u.lastActivityAt = Date.now();
    this.usage.toolInvocations += 1;
  }

  // --- server / tool control ---
  toggleServer(serverId: string, enabled: boolean): void {
    const s = this.servers.get(serverId);
    if (!s) return;
    s.enabled = enabled;
    s.health = enabled ? "ok" : "disabled";
    s.lastPingAt = Date.now();
    this.emit({ type: "server_state", state: { ...s } });
    this.logEvent("info", `${enabled ? "enabled" : "disabled"} server "${serverId}"`);
  }

  pinTool(toolId: string, pinned: boolean): void {
    const t = this.tools.get(toolId);
    if (!t) return;
    t.pinned = pinned;
    this.emit({ type: "tool_state", state: { ...t } });
  }

  enabledServerIds(): string[] {
    return [...this.servers.values()].filter((s) => s.enabled).map((s) => s.id);
  }

  pinnedToolIds(): string[] {
    return [...this.tools.values()].filter((t) => t.pinned).map((t) => t.id);
  }

  /**
   * Snapshot of live state the engine should condition each iteration on.
   * This is the "read project + server data" step in the loop: every iteration
   * the engine pulls this and folds it into the system prompt.
   */
  readContext(): {
    enabledServers: string[];
    pinnedTools: string[];
    openResources: string[];
    recentCalls: Array<{ toolId: string; isError: boolean; resultPreview: string | null }>;
  } {
    return {
      enabledServers: this.enabledServerIds(),
      pinnedTools: this.pinnedToolIds(),
      openResources: [...this.resources.values()]
        .filter((n) => n.parentId !== null)
        .map((n) => n.id),
      recentCalls: this.replay
        .slice(-5)
        .map((r) => ({
          toolId: r.toolId,
          isError: r.isError,
          resultPreview: r.result ? truncate(r.result, 200) : null,
        })),
    };
  }

  // --- resources ---
  async expandResourceNode(nodeId: string): Promise<void> {
    const children = await this.provider.expandResource(nodeId);
    if (children.length === 0) return;
    let added = 0;
    for (const child of children) {
      if (!this.resources.has(child.id)) {
        this.resources.set(child.id, child);
        added++;
      }
    }
    if (added > 0) {
      this.emit({ type: "resource_tree", nodes: [...this.resources.values()] });
    }
  }

  // --- approvals (pause-on-approval primitive) ---
  awaitApproval(req: Omit<PendingApproval, "createdAt">): Promise<ApprovalVerdict> {
    const pending: PendingApproval = { ...req, createdAt: Date.now() };
    this.pending.set(req.requestId, pending);
    this.status = "awaiting_input";
    this.emit({ type: "approval_pending", pending });

    // Auto-approve if user previously selected "approve and remember".
    const key = `${req.serverId}::${req.toolId}`;
    if (this.remembered.has(key)) {
      this.logEvent("info", `auto-approved ${req.toolId} (remembered)`);
      const verdict: ApprovalVerdict = { kind: "approve", args: req.args };
      queueMicrotask(() => this.resolveApproval(req.requestId, verdict));
    }

    return new Promise<ApprovalVerdict>((resolve) => {
      this.resolvers.set(req.requestId, resolve);
    });
  }

  resolveApproval(requestId: string, verdict: ApprovalVerdict): boolean {
    const resolver = this.resolvers.get(requestId);
    const pending = this.pending.get(requestId);
    if (!resolver || !pending) return false;
    this.resolvers.delete(requestId);
    this.pending.delete(requestId);
    if (verdict.kind === "approve_remember") {
      this.remembered.add(`${pending.serverId}::${pending.toolId}`);
    }
    if (verdict.kind === "deny") this.usage.denials += 1;
    else this.usage.approvals += 1;
    this.emit({ type: "approval_resolved", requestId, verdict });
    this.emitUsage();
    this.status = this.pending.size > 0 ? "awaiting_input" : "running";
    resolver(verdict);
    return true;
  }

  // --- replay log ---
  recordToolStart(entry: Omit<ReplayEntry, "completedAt" | "result" | "isError">): ReplayEntry {
    const full: ReplayEntry = { ...entry, completedAt: null, result: null, isError: false };
    this.replay.push(full);
    this.emit({
      type: "tool_started",
      replayId: full.id,
      iteration: full.iteration,
      serverId: full.serverId,
      toolId: full.toolId,
      args: full.args,
    });
    const t = this.tools.get(full.toolId);
    if (t) {
      t.invocationCount += 1;
      t.lastInvokedAt = Date.now();
      this.emit({ type: "tool_state", state: { ...t } });
    }
    return full;
  }

  recordToolCompletion(replayId: string, result: string, isError: boolean): void {
    const entry = this.replay.find((r) => r.id === replayId);
    if (!entry) return;
    entry.completedAt = Date.now();
    entry.result = result;
    entry.isError = isError;
    this.emit({ type: "tool_completed", replayId, result, isError });
    const t = this.tools.get(entry.toolId);
    if (t) {
      t.lastResultPreview = result.length > 240 ? `${result.slice(0, 240)}…` : result;
      t.lastIsError = isError;
      this.emit({ type: "tool_state", state: { ...t } });
    }
    // Roll the result into per-server usage (bytes ≈ result length).
    this.recordServerActivity(entry.serverId, result.length, isError);
    this.emitUsage();
  }

  /** Direct accessors used by replay/branch flows. */
  getReplayEntry(replayId: string): ReplayEntry | undefined {
    return this.replay.find((r) => r.id === replayId);
  }

  replayLog(): ReplayEntry[] {
    return [...this.replay];
  }

  resetStop(): void {
    this.stopRequested = false;
  }

  // --- lifecycle ---
  requestStop(): void {
    this.stopRequested = true;
    for (const id of [...this.resolvers.keys()]) {
      this.resolveApproval(id, { kind: "deny", reason: "session stopped" });
    }
  }
  shouldStop(): boolean {
    return this.stopRequested;
  }

  dispose(): void {
    this.disposed = true;
    this.stopPingLoop();
    this.subscribers.clear();
    this.resolvers.clear();
    this.pending.clear();
  }
}

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

export { makeId };
