/**
 * ChannelManager + SubscriptionSession (bidirectional-engine-plan §8).
 *
 * ChannelManager: globalThis-hoisted registry keyed by channelKey. Lazily
 * creates a Channel on first subscription, ref-counts subscriptions, and drops
 * a Channel after a grace window once its last subscriber leaves. This is the
 * shared owner — UNLIKE today's per-session poll loops.
 *
 * SubscriptionSession: the per-craft FAN-IN multiplexer. One craft -> one
 * SSE -> many channels multiplexed onto it. Holds the bindings and the live SSE
 * write sink; subscribes to each Channel and tags frames with the craft-local
 * `as` alias before writing them to the single stream.
 */
import type { ChannelBinding, ChannelFrame } from "./wire";
import { channelKey, type ChannelRef } from "./ref";
import { Channel } from "./channel";
import { getMcpProvider } from "@/lib/mcpdeck/provider";

const GRACE_MS = 20_000;

interface Entry {
  channel: Channel;
  graceTimer: ReturnType<typeof setTimeout> | null;
}

// Hoist both registries into globalThis so Next.js HMR doesn't drop live channels.
const MGR_KEY = Symbol.for("crafts.channel.manager");
const SUB_KEY = Symbol.for("crafts.channel.subscriptions");
type G = typeof globalThis & {
  [MGR_KEY]?: Map<string, Entry>;
  [SUB_KEY]?: Map<string, SubscriptionSession>;
};
const g = globalThis as G;
const CHANNELS: Map<string, Entry> = g[MGR_KEY] ?? (g[MGR_KEY] = new Map());
const SUBSCRIPTIONS: Map<string, SubscriptionSession> = g[SUB_KEY] ?? (g[SUB_KEY] = new Map());

function getOrCreateChannel(ref: ChannelRef): Channel {
  const key = channelKey(ref);
  const existing = CHANNELS.get(key);
  if (existing) {
    if (existing.graceTimer) {
      clearTimeout(existing.graceTimer); // resubscribe within grace -> reuse warm channel
      existing.graceTimer = null;
    }
    return existing.channel;
  }
  const channel = new Channel(key, ref.channel, ref.args);
  CHANNELS.set(key, { channel, graceTimer: null });
  return channel;
}

/** Schedule a drop when a channel's last subscriber leaves (cancelled by resubscribe). */
function scheduleDropIfIdle(key: string): void {
  const entry = CHANNELS.get(key);
  if (!entry || entry.channel.refCount() > 0 || entry.graceTimer) return;
  entry.graceTimer = setTimeout(() => {
    const e = CHANNELS.get(key);
    if (e && e.channel.refCount() === 0) {
      e.channel.stop();
      CHANNELS.delete(key);
    }
  }, GRACE_MS);
  entry.graceTimer.unref?.();
}

export interface SubscribeInput {
  threadId: string;
  craftId: string;
  channels: ChannelBinding[];
}

/** Create a fan-in subscription session for a craft. The SSE stream attaches later. */
export async function subscribeChannels(input: SubscribeInput): Promise<{
  sessionId: string;
  channels: Array<{ channel: string; key: string; rev: number }>;
}> {
  const provider = await getMcpProvider();
  const sessionId = makeId("sub");
  const bindings: BindingState[] = [];
  const summary: Array<{ channel: string; key: string; rev: number }> = [];

  for (const b of input.channels) {
    const ref: ChannelRef = { provider: provider.kind, channel: b.channel, args: b.args ?? {} };
    const key = channelKey(ref);
    getOrCreateChannel(ref); // lazily ensure it exists (loop starts on first subscriber)
    bindings.push({ key, channel: b.channel, as: b.as, pollS: b.poll_s });
    summary.push({ channel: b.channel, key, rev: 0 });
  }

  const session = new SubscriptionSession(sessionId, input.threadId, input.craftId, bindings);
  SUBSCRIPTIONS.set(sessionId, session);
  return { sessionId, channels: summary };
}

export function getSubscription(id: string): SubscriptionSession | undefined {
  return SUBSCRIPTIONS.get(id);
}

export function getChannelByKey(key: string): Channel | undefined {
  return CHANNELS.get(key)?.channel;
}

/** route:direct relay backing POST /channel/{key}/request. */
export async function requestDirect(
  key: string,
  op: string,
  args: Record<string, unknown>,
): Promise<{ result: unknown; isError: boolean }> {
  const channel = CHANNELS.get(key)?.channel;
  if (!channel) return { result: { message: "channel not found" }, isError: true };
  return channel.request(op, args);
}

/**
 * Force an immediate re-poll of every channel a subscription session is bound
 * to, fanning fresh snapshots to all subscribers. Backs the "Refresh" button:
 * the live view updates instantly instead of waiting for the next tick.
 */
export async function refreshSession(sessionId: string): Promise<number> {
  const session = SUBSCRIPTIONS.get(sessionId);
  if (!session) return 0;
  let polled = 0;
  await Promise.all(
    session.bindingKeys().map(async (key) => {
      const channel = CHANNELS.get(key)?.channel;
      if (channel) {
        await channel.pollNow();
        polled++;
      }
    }),
  );
  return polled;
}

interface BindingState {
  key: string;
  channel: string;
  as: string;
  pollS: number;
}

export class SubscriptionSession {
  readonly sessionId: string;
  readonly threadId: string;
  readonly craftId: string;
  private bindings: BindingState[];
  private unsubs: Array<() => void> = [];

  constructor(sessionId: string, threadId: string, craftId: string, bindings: BindingState[]) {
    this.sessionId = sessionId;
    this.threadId = threadId;
    this.craftId = craftId;
    this.bindings = bindings;
  }

  /**
   * Attach the live SSE sink. Subscribes to every channel; frames from all
   * channels multiplex onto the single `write`. Returns a teardown fn that
   * unsubscribes all and schedules grace-drops.
   */
  attach(write: (frame: ChannelFrame) => void): () => void {
    for (const b of this.bindings) {
      const channel = getChannelByKey(b.key);
      if (!channel) continue;
      const unsub = channel.subscribe(this.sessionId, b.as, b.pollS, (frame) => {
        // tag with this craft's local alias (fan-in)
        write({ ...frame, as: b.as });
      });
      this.unsubs.push(() => {
        unsub();
        scheduleDropIfIdle(b.key);
      });
    }
    return () => this.detach();
  }

  detach(): void {
    for (const u of this.unsubs) {
      try {
        u();
      } catch {
        /* ignore */
      }
    }
    this.unsubs = [];
    SUBSCRIPTIONS.delete(this.sessionId);
  }

  bindingKeys(): string[] {
    return this.bindings.map((b) => b.key);
  }
}

export function makeId(prefix: string): string {
  // No Date.now()/Math.random() at module scope; fine inside a request handler.
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}
