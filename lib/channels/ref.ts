/**
 * Channel identity. Two independent crafts/threads that watch the SAME asset op
 * with the SAME args must collapse onto ONE Channel (one poll loop, fanned out).
 * The key is a deterministic, sorted-key serialization so arg-equal subscriptions
 * hash identically.
 */

export interface ChannelRef {
  /** "mock" | "real" — the active provider kind, so mock/real never share a channel. */
  provider: string;
  /** The asset op being polled (a provider toolId, or a synthetic "mock.*" source). */
  channel: string;
  args: Record<string, unknown>;
}

/** Deterministic JSON: object keys sorted recursively, undefined stripped. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function channelKey(ref: ChannelRef): string {
  return `${ref.provider}:${ref.channel}:${stableStringify(ref.args)}`;
}
