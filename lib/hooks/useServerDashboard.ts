"use client";

import { useChannel } from "@/lib/hooks/useChannel";
import type { DashboardDef } from "@/lib/mcpdeck/apps/dashboards";

export type DashStatus = "loading" | "empty" | "data" | "error";

export interface ServerDashboard {
  data: Record<string, unknown>;
  rev: Record<string, number>;
  connected: boolean;
  probeResolved: boolean;
  request: (channel: string, op: string, args?: Record<string, unknown>) => Promise<unknown>;
}

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

function isResolved(payload: unknown): boolean {
  if (payload == null) return false;
  if (isErrorPayload(payload)) return false;
  return true;
}

export function isErrorPayload(payload: unknown): boolean {
  if (payload == null || typeof payload !== "object") return false;
  const o = payload as Record<string, unknown>;
  const keys = Object.keys(o);
  return keys.length === 1 && keys[0] === "message" && typeof o.message === "string";
}

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
