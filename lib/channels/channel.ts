/**
 * Channel — the heart of the bidirectional engine (bidirectional-engine-plan §8).
 *
 * One Channel = ONE poll loop + latest state + a rev-stamped delta buffer +
 * a subscriber set. It is keyed by asset connection (channelKey), so many crafts
 * across many threads that watch the same asset SHARE it: the asset is polled
 * ONCE and the result is fanned out to every subscriber. 50 dashboards on one
 * fleet asset = one poll loop, not 50.
 *
 * Lifecycle is owned by ChannelManager: lazily created on first subscription,
 * dropped after a grace window on last unsubscribe. It tracks LIVE subscriptions,
 * never stored crafts.
 */
import type { ChannelFrame, ChannelOp } from "./wire";
import { pollSource } from "./sources";

interface Subscriber {
  sessionId: string;
  as: string;
  pollMs: number;
  cb: (frame: Omit<ChannelFrame, "as">) => void;
}

const BUFFER_MAX = 200;

export class Channel {
  readonly key: string;
  readonly channel: string; // public op id
  private args: Record<string, unknown>;

  private subs = new Map<string, Subscriber>();
  private buffer: ChannelFrame[] = []; // rev-stamped (as omitted; per-sub alias applied on send)
  private latest: { rev: number; op: ChannelOp; payload: unknown } | null = null;
  private rev = 0;
  private tick = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private effectivePollMs = Infinity;
  private polling = false; // re-entrancy guard

  constructor(key: string, channel: string, args: Record<string, unknown>) {
    this.key = key;
    this.channel = channel;
    this.args = args;
  }

  /** Attach a subscriber. Starts/retightens the poll loop. Returns an unsubscribe fn. */
  subscribe(
    sessionId: string,
    as: string,
    pollS: number,
    cb: (frame: Omit<ChannelFrame, "as">) => void,
  ): () => void {
    this.subs.set(sessionId, { sessionId, as, pollMs: Math.max(500, pollS * 1000), cb });
    this.recomputeCadence();
    // Hand the new subscriber the current snapshot immediately if we have one.
    if (this.latest) cb({ channel: this.channel, op: this.latest.op, rev: this.latest.rev, payload: this.latest.payload });
    else void this.poll(); // first subscriber: poll right away so the UI isn't blank
    return () => {
      this.subs.delete(sessionId);
      this.recomputeCadence();
    };
  }

  /** route:direct relay — a mechanical asset call straight through. Never re-emits. */
  async request(op: string, args: Record<string, unknown>): Promise<{ result: unknown; isError: boolean }> {
    const r = await pollSource(op, args, this.tick);
    return { result: r.payload, isError: r.isError };
  }

  /**
   * Force an immediate poll NOW and fan the fresh snapshot to every subscriber
   * (a new rev). This is what a "Refresh" button drives: it re-polls the asset
   * out of cadence so a change made elsewhere (e.g. a new repo) appears live,
   * without waiting for the next scheduled tick.
   */
  async pollNow(): Promise<number> {
    await this.poll();
    return this.rev;
  }

  /** Replay buffered frames after a rev; null signals a gap (caller must snapshot). */
  replayAfter(rev: number): ChannelFrame[] | null {
    if (this.buffer.length === 0) return [];
    if (rev < this.buffer[0].rev - 1) return null; // older than we retain -> gap
    return this.buffer.filter((f) => f.rev > rev);
  }

  latestFrame(): { rev: number; op: ChannelOp; payload: unknown } | null {
    return this.latest;
  }

  refCount(): number {
    return this.subs.size;
  }

  /** Tear down the poll loop. Called by the manager on grace-window expiry. */
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.subs.clear();
  }

  // --- internals ---

  private recomputeCadence(): void {
    let min = Infinity;
    for (const s of this.subs.values()) min = Math.min(min, s.pollMs);
    if (min === this.effectivePollMs) return;
    this.effectivePollMs = min;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (min !== Infinity) {
      this.timer = setInterval(() => void this.poll(), min);
    }
  }

  private async poll(): Promise<void> {
    if (this.polling) return; // a slow asset call must never overlap itself
    this.polling = true;
    try {
      const r = await pollSource(this.channel, this.args, this.tick++);
      const op: ChannelOp = r.isError ? "error" : "snapshot";
      this.emit(op, r.payload);
    } finally {
      this.polling = false;
    }
  }

  private emit(op: ChannelOp, payload: unknown): void {
    this.rev += 1;
    const base = { channel: this.channel, op, rev: this.rev, payload };
    this.latest = { rev: this.rev, op, payload };
    // Buffer for reconnect replay (store with a neutral `as`; per-sub alias on send).
    this.buffer.push({ ...base, as: "" });
    if (this.buffer.length > BUFFER_MAX) this.buffer.splice(0, this.buffer.length - BUFFER_MAX);
    // Fan-out: one poll -> every subscriber. A dead sink must not break the loop.
    for (const s of this.subs.values()) {
      try {
        s.cb(base);
      } catch {
        /* ignore one bad subscriber */
      }
    }
  }
}
