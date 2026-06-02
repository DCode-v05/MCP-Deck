/**
 * What a channel polls. The spec's channel polls a credentialed MCP asset
 * (provider.callTool). But mock tools return CONSTANT strings, so polling would
 * yield one snapshot then nothing forever — the critique's "inert live demo".
 *
 * So a channel source is one of:
 *  - a real/mock provider tool      -> getMcpProvider().callTool(op, args)
 *  - a SYNTHETIC "mock.*" source    -> a deterministic-ish varying value, so the
 *    fan-out / rev / snapshot machinery is genuinely exercised end-to-end.
 *
 * Synthetic sources are seeded per channel and advance on each poll — no
 * Date.now()/Math.random() at module scope (those break SSR), the wander is a
 * pure function of a per-channel tick counter.
 */
import { getMcpProvider } from "@/lib/mcpdeck/provider";

export interface PollResult {
  payload: unknown;
  isError: boolean;
}

const SYNTHETIC_PREFIX = "mock.";

export function isSyntheticChannel(op: string): boolean {
  return op.startsWith(SYNTHETIC_PREFIX);
}

/** Deterministic pseudo-wander in [lo,hi] from an integer tick (no Math.random). */
function wander(tick: number, lo: number, hi: number, seed: number): number {
  // A cheap hashed sine — stable per (tick,seed), spreads across the range.
  const x = Math.sin((tick + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  const frac = x - Math.floor(x); // [0,1)
  return Math.round((lo + frac * (hi - lo)) * 10) / 10;
}

/**
 * Poll a channel source once. `tick` is the channel's monotonic poll counter,
 * used to vary synthetic sources so deltas actually occur.
 */
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
    // Unknown synthetic source: a plain counter so it still varies.
    return { payload: { value: wander(tick, 0, 100, seed), tick }, isError: false };
  }

  // Real path: poll the active MCP provider (mock or real servers).
  try {
    const provider = await getMcpProvider();
    // Strip meta params some servers list but reject when present (e.g. Notion-Version).
    const callArgs = { ...args };
    delete (callArgs as Record<string, unknown>)["Notion-Version"];
    // Safety net: if the tool has required args we don't have, don't hammer the
    // server with calls that always fail — return a "needs input" payload instead.
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

/** Tolerant: parse a tool result as JSON if it looks like JSON, else keep the string. */
function parseToolResult(raw: string): unknown {
  const s = raw.trim();
  if (s.startsWith("{") || s.startsWith("[")) {
    try {
      return JSON.parse(s);
    } catch {
      /* fall through */
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
