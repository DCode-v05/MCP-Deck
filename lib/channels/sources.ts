import { getMcpProvider } from "@/lib/mcpdeck/provider";

export interface PollResult {
  payload: unknown;
  isError: boolean;
}

const SYNTHETIC_PREFIX = "mock.";

export function isSyntheticChannel(op: string): boolean {
  return op.startsWith(SYNTHETIC_PREFIX);
}

function wander(tick: number, lo: number, hi: number, seed: number): number {
  const x = Math.sin((tick + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  const frac = x - Math.floor(x);
  return Math.round((lo + frac * (hi - lo)) * 10) / 10;
}

export async function pollSource(
  op: string,
  args: Record<string, unknown>,
  tick: number,
): Promise<PollResult> {
  if (isSyntheticChannel(op)) {
    const seed = hashSeed(op + stableArgs(args));
    if (op === "mock.live_metric") {
      const p99 = wander(tick, 120, 950, seed);
      const errRate = Math.max(0, (p99 - 300) / 100) * 0.8;
      return {
        payload: { p99_ms: p99, error_rate: Math.round(errRate * 10) / 10, tick },
        isError: false,
      };
    }
    if (op === "mock.fleet") {
      const count = 12;
      const trucks = Array.from({ length: count }, (_, i) => {
        const moving = wander(tick + i * 7, 0, 1, seed + i) > 0.25;
        return { truck_id: `T${i + 1}`, status: moving ? "moving" : "stopped" };
      });
      const stopped = trucks.filter((t) => t.status === "stopped").length;
      return { payload: { trucks, stopped, total: count, tick }, isError: false };
    }
    return { payload: { value: wander(tick, 0, 100, seed), tick }, isError: false };
  }

  try {
    const provider = await getMcpProvider();
    const callArgs = { ...args };
    delete (callArgs as Record<string, unknown>)["Notion-Version"];
    const required = provider.findTool(op)?.inputSchema.required ?? [];
    const missing = required.filter(
      (k) => callArgs[k] === undefined || callArgs[k] === null || callArgs[k] === "",
    );
    if (missing.length > 0) {
      return { payload: { needsInput: missing, message: `Select a value for: ${missing.join(", ")}` }, isError: false };
    }
    const { result, isError } = await provider.callTool(op, callArgs);
    return { payload: parseToolResult(result), isError };
  } catch (err) {
    return { payload: { message: err instanceof Error ? err.message : String(err) }, isError: true };
  }
}

function parseToolResult(raw: string): unknown {
  const s = raw.trim();
  if (s.startsWith("{") || s.startsWith("[")) {
    try {
      return JSON.parse(s);
    } catch {
    }
  }
  return raw;
}

function stableArgs(args: Record<string, unknown>): string {
  return Object.keys(args)
    .sort()
    .map((k) => `${k}=${String(args[k])}`)
    .join("&");
}

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h % 1000);
}
