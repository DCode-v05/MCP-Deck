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
  readonly channel: string;
  private args: Record<string, unknown>;

  private subs = new Map<string, Subscriber>();
  private buffer: ChannelFrame[] = [];
  private latest: { rev: number; op: ChannelOp; payload: unknown } | null = null;
  private rev = 0;
  private tick = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private effectivePollMs = Infinity;
  private polling = false;

  constructor(key: string, channel: string, args: Record<string, unknown>) {
    this.key = key;
    this.channel = channel;
    this.args = args;
  }

  subscribe(
    sessionId: string,
    as: string,
    pollS: number,
    cb: (frame: Omit<ChannelFrame, "as">) => void,
  ): () => void {
    this.subs.set(sessionId, { sessionId, as, pollMs: Math.max(500, pollS * 1000), cb });
    this.recomputeCadence();
    if (this.latest) cb({ channel: this.channel, op: this.latest.op, rev: this.latest.rev, payload: this.latest.payload });
    else void this.poll();
    return () => {
      this.subs.delete(sessionId);
      this.recomputeCadence();
    };
  }

  async request(op: string, args: Record<string, unknown>): Promise<{ result: unknown; isError: boolean }> {
    const r = await pollSource(op, args, this.tick);
    return { result: r.payload, isError: r.isError };
  }

  async pollNow(): Promise<number> {
    await this.poll();
    return this.rev;
  }

  replayAfter(rev: number): ChannelFrame[] | null {
    if (this.buffer.length === 0) return [];
    if (rev < this.buffer[0].rev - 1) return null;
    return this.buffer.filter((f) => f.rev > rev);
  }

  latestFrame(): { rev: number; op: ChannelOp; payload: unknown } | null {
    return this.latest;
  }

  refCount(): number {
    return this.subs.size;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.subs.clear();
  }

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
    if (this.polling) return;
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
    this.buffer.push({ ...base, as: "" });
    if (this.buffer.length > BUFFER_MAX) this.buffer.splice(0, this.buffer.length - BUFFER_MAX);
    for (const s of this.subs.values()) {
      try {
        s.cb(base);
      } catch {
      }
    }
  }
}
