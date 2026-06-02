/**
 * The Crafts "channel wire" protocol (bidirectional-engine-plan §8, §17).
 * Client-safe: types + the SSE frame encoder only. No Node built-ins, no React,
 * so both the server routes and a client renderer can import it.
 *
 * Transport: SSE down (data frames) + HTTP POST up (subscribe / route:direct).
 */

/**
 * Op vocabulary. The slice ships "snapshot" only (always correct — the whole
 * latest state each tick, no diffing). add/update/remove deltas are a later
 * layer once a keyed record shape is defined. "error" reports a poll failure.
 */
export type ChannelOp = "snapshot" | "error";

/** One SSE `event: data` frame, multiplexed onto a craft's single stream. */
export interface ChannelFrame {
  channel: string; // the channel's public id (stable across equal subscriptions)
  as: string; // craft-local alias from the subscribe entry
  op: ChannelOp;
  rev: number; // monotonic per-channel revision; the client's reconnect cursor
  payload: unknown; // op=snapshot -> full latest state; op=error -> { message }
}

/** One entry in a craft's subscribe[] (bidirectional-engine-plan §4, §7). */
export interface ChannelBinding {
  /** The asset op to poll — a provider toolId, or "mock.live_metric" (synthetic). */
  channel: string;
  args?: Record<string, unknown>;
  /** Local name the craft binds this channel's data to. */
  as: string;
  /** Desired cadence in seconds. The channel polls at the tightest of all subscribers. */
  poll_s: number;
}

export interface SubscribeRequest {
  thread_id: string;
  craft_id: string;
  channels: ChannelBinding[];
}

export interface SubscribeResponse {
  session_id: string;
  /** Per requested channel: its public id + dedupe key + current rev. */
  channels: Array<{ channel: string; key: string; rev: number }>;
}

/** route:direct outbound op (a mechanical asset call — never touches the engine). */
export interface RequestBody {
  op: string;
  args?: Record<string, unknown>;
}
export interface RequestResponse {
  ok: boolean;
  result: unknown;
  isError: boolean;
}

/**
 * Encode one frame as an SSE block. `id:` carries the rev so the browser's
 * Last-Event-ID gives us the reconnect cursor for free.
 */
export function encodeFrame(f: ChannelFrame): string {
  return `id: ${f.rev}\nevent: data\ndata: ${JSON.stringify(f)}\n\n`;
}
