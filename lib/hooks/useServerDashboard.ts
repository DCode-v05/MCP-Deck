"use client";

import { useChannel } from "@/lib/hooks/useChannel";
import type { DashboardDef } from "@/lib/mcpdeck/apps/dashboards";

export type DashStatus = "loading" | "empty" | "data" | "error";

export interface ServerDashboard {
  /** parsed payload per alias (already JSON-parsed by sources.ts/parseToolResult) */
  data: Record<string, unknown>;
  rev: Record<string, number>;
  connected: boolean;
  /** identity from the probe channel, if resolved (e.g. notion self, slack users) */
  probeResolved: boolean;
  request: (channel: string, op: string, args?: Record<string, unknown>) => Promise<unknown>;
}

/** Subscribe a dashboard to its channels (fan-in, one SSE) via the shared loop. */
export function useServerDashboard(def: DashboardDef): ServerDashboard {
  const { state, request } = useChannel(`thr_${def.serverId}`, `app_${def.serverId}`, def.bindings);
  const probeResolved = def.probeAs ? isResolved(state.data[def.probeAs]) : state.connected;
  return {
    data: state.data,
    rev: state.rev,
    connected: state.connected,
    probeResolved,
    request,
  };
}

/** A payload counts as "resolved" if it's a non-error object/array with content. */
function isResolved(payload: unknown): boolean {
  if (payload == null) return false;
  if (isErrorPayload(payload)) return false;
  return true;
}

/** sources.ts wraps a thrown provider call as { message }. Treat that as error. */
export function isErrorPayload(payload: unknown): boolean {
  if (payload == null || typeof payload !== "object") return false;
  const o = payload as Record<string, unknown>;
  const keys = Object.keys(o);
  return keys.length === 1 && keys[0] === "message" && typeof o.message === "string";
}

/**
 * Derive the three-state status for a list-bearing alias.
 *  - no frame yet            -> "loading"
 *  - error payload           -> "error"
 *  - resolved but list empty -> "empty"  (connected, finish setup)
 *  - list has items          -> "data"
 */
export function listStatus(
  dash: ServerDashboard,
  as: string,
  extract: (payload: unknown) => unknown[] | null,
): { status: DashStatus; items: unknown[]; rev: number; errorMessage?: string } {
  const payload = dash.data[as];
  const rev = dash.rev[as] ?? 0;
  if (payload === undefined) return { status: "loading", items: [], rev };
  if (isErrorPayload(payload)) {
    return { status: "error", items: [], rev, errorMessage: String((payload as { message: unknown }).message) };
  }
  const items = extract(payload);
  if (items === null) return { status: "loading", items: [], rev };
  return { status: items.length > 0 ? "data" : "empty", items, rev };
}
