export interface ChannelRef {
  provider: string;
  channel: string;
  args: Record<string, unknown>;
}

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
