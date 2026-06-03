"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type {
  ApprovalVerdict,
  McpDeckEvent,
  McpResourceNode,
  McpServerInfo,
  McpServerState,
  McpToolInfo,
  McpToolState,
  PendingApproval,
  ReplayEntry,
  UpstreamMessage,
  UsageStats,
} from "@/lib/mcpdeck/types";
import type { CraftBlock } from "@/lib/crafts/craft-block";

/**
 * A single entry in the "Model Processing" trace: the model's reasoning, a tool
 * it used (with args + result), a live panel it rendered, or the final outcome.
 */
export type TraceItem =
  | { id: string; ts: number; kind: "reasoning"; text: string }
  | {
      id: string;
      ts: number;
      kind: "tool";
      replayId: string;
      toolId: string;
      serverId: string;
      args: Record<string, unknown>;
      status: "running" | "ok" | "error";
      result?: string;
      write: boolean;
    }
  | { id: string; ts: number; kind: "craft"; blockId: string; title: string }
  | { id: string; ts: number; kind: "done"; text: string; level: "info" | "error" };

/** One past agent run, for the conversation-history list. */
export interface RunSummary {
  sessionId: string;
  goal: string;
  startedAt: number;
  status: string;
  summary: string | null;
}

export interface McpDeckState {
  sessionId: string | null;
  status: "idle" | "starting" | "running" | "awaiting_input" | "completed" | "error";
  goal: string | null;
  iteration: number;
  providerKind: "mock" | "real" | null;
  catalogue: { servers: McpServerInfo[]; tools: McpToolInfo[] };
  servers: Record<string, McpServerState>;
  tools: Record<string, McpToolState>;
  resources: McpResourceNode[];
  replay: ReplayEntry[];
  pending: PendingApproval[];
  traces: TraceItem[];
  crafts: CraftBlock[];
  /** Past runs in this process (persists across reloads until dev restarts). */
  history: RunSummary[];
  usage: { inputTokens: number; outputTokens: number; totalCost: number } | null;
  usageStats: UsageStats | null;
  finalSummary: string | null;
  error: string | null;
}

const INITIAL_STATE: McpDeckState = {
  sessionId: null,
  status: "idle",
  goal: null,
  iteration: 0,
  providerKind: null,
  catalogue: { servers: [], tools: [] },
  servers: {},
  tools: {},
  resources: [],
  replay: [],
  pending: [],
  traces: [],
  crafts: [],
  history: [],
  usage: null,
  usageStats: null,
  finalSummary: null,
  error: null,
};

type Action =
  | { kind: "reset" }
  | { kind: "set_status"; status: McpDeckState["status"] }
  | { kind: "set_catalogue"; servers: McpServerInfo[]; tools: McpToolInfo[]; providerKind: "mock" | "real" }
  | { kind: "set_history"; runs: RunSummary[] }
  | { kind: "event"; ev: McpDeckEvent };

function reducer(state: McpDeckState, action: Action): McpDeckState {
  switch (action.kind) {
    case "reset":
      // Keep the catalogue and the history list across a reset.
      return { ...INITIAL_STATE, catalogue: state.catalogue, history: state.history };
    case "set_history":
      return { ...state, history: action.runs };
    case "set_status":
      return { ...state, status: action.status };
    case "set_catalogue":
      return {
        ...state,
        providerKind: action.providerKind,
        catalogue: { servers: action.servers, tools: action.tools },
      };
    case "event":
      return applyEvent(state, action.ev);
  }
}

function applyEvent(state: McpDeckState, ev: McpDeckEvent): McpDeckState {
  switch (ev.type) {
    case "session_ready":
      return { ...state, sessionId: ev.sessionId, status: state.status === "starting" ? "running" : state.status };
    case "server_state":
      return { ...state, servers: { ...state.servers, [ev.state.id]: ev.state } };
    case "tool_state":
      return { ...state, tools: { ...state.tools, [ev.state.id]: ev.state } };
    case "resource_tree":
      return { ...state, resources: ev.nodes };
    case "approval_pending":
      return {
        ...state,
        status: "awaiting_input",
        pending: [...state.pending.filter((p) => p.requestId !== ev.pending.requestId), ev.pending],
      };
    case "approval_resolved": {
      const remaining = state.pending.filter((p) => p.requestId !== ev.requestId);
      return {
        ...state,
        pending: remaining,
        status: remaining.length > 0 ? "awaiting_input" : "running",
      };
    }
    case "tool_started": {
      const entry: ReplayEntry = {
        id: ev.replayId,
        iteration: ev.iteration,
        serverId: ev.serverId,
        toolId: ev.toolId,
        args: ev.args,
        argsEdited: false,
        verdict: "approved",
        result: null,
        isError: false,
        startedAt: Date.now(),
        completedAt: null,
      };
      const write = state.catalogue.tools.find((t) => t.id === ev.toolId)?.hasSideEffect ?? false;
      return {
        ...state,
        replay: [...state.replay, entry],
        traces: pushTrace(state.traces, {
          kind: "tool",
          replayId: ev.replayId,
          toolId: ev.toolId,
          serverId: ev.serverId,
          args: ev.args,
          status: "running",
          write,
        }),
      };
    }
    case "tool_completed": {
      const replay = state.replay.map((r) =>
        r.id === ev.replayId
          ? { ...r, result: ev.result, isError: ev.isError, completedAt: Date.now() }
          : r,
      );
      const traces = state.traces.map((t) =>
        t.kind === "tool" && t.replayId === ev.replayId
          ? { ...t, status: ev.isError ? ("error" as const) : ("ok" as const), result: clip(ev.result, 1200) }
          : t,
      );
      return { ...state, replay, traces };
    }
    case "engine_text":
      return { ...state, traces: appendReasoning(state.traces, ev.text) };
    case "engine_iteration":
      return { ...state, iteration: ev.iteration, goal: ev.goal };
    case "engine_thought":
      // The model's own narration (engine_text) is the visible reasoning; the
      // system-generated intent is not surfaced as a separate trace.
      return state;
    case "craft":
      return {
        ...state,
        crafts: [...state.crafts.filter((c) => c.id !== ev.block.id), ev.block],
        traces: pushTrace(state.traces, {
          kind: "craft",
          blockId: ev.block.id,
          title: ev.block.payload.title,
        }),
      };
    case "engine_done":
      return {
        ...state,
        status: ev.reason === "error" ? "error" : "completed",
        finalSummary: ev.summary,
        traces: pushTrace(state.traces, {
          kind: "done",
          text: ev.summary ?? (ev.reason === "stopped" ? "Stopped." : "Done."),
          level: ev.reason === "error" ? "error" : "info",
        }),
      };
    case "usage":
      return {
        ...state,
        usage: { inputTokens: ev.inputTokens, outputTokens: ev.outputTokens, totalCost: ev.totalCost },
      };
    case "usage_state":
      return {
        ...state,
        usageStats: ev.usage,
        usage: {
          inputTokens: ev.usage.inputTokens,
          outputTokens: ev.usage.outputTokens,
          totalCost: ev.usage.totalCost,
        },
      };
    case "log":
      // Logs (retries, info) are kept out of the trace to keep it readable.
      return state;
    case "error":
      return {
        ...state,
        status: "error",
        error: ev.message,
        traces: pushTrace(state.traces, { kind: "done", text: ev.message, level: "error" }),
      };
  }
}

// Distribute the Omit across the union so each variant keeps its own fields
// (a plain Omit<Union, K> collapses to the shared `kind` property only).
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function pushTrace(prev: TraceItem[], partial: DistributiveOmit<TraceItem, "id" | "ts">): TraceItem[] {
  const next = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ts: Date.now(),
    ...partial,
  } as TraceItem;
  const arr = [...prev, next];
  return arr.length > 400 ? arr.slice(arr.length - 400) : arr;
}

/** Stream reasoning text into the last reasoning item, or start a new one. */
function appendReasoning(prev: TraceItem[], text: string): TraceItem[] {
  const last = prev[prev.length - 1];
  if (last && last.kind === "reasoning") {
    const merged: TraceItem = { ...last, text: last.text + text };
    return [...prev.slice(0, -1), merged];
  }
  return pushTrace(prev, { kind: "reasoning", text });
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

async function* parseSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<McpDeckEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sepIdx;
    while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);
      let dataLine = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("data:")) dataLine += line.slice(5).trim();
      }
      if (!dataLine) continue;
      try {
        yield JSON.parse(dataLine) as McpDeckEvent;
      } catch {
        /* ignore */
      }
    }
  }
}

export function useMcpDeck() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // Catalogue is static — fetch once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/mcpdeck/catalogue");
        const data = (await res.json()) as {
          servers: McpServerInfo[];
          tools: McpToolInfo[];
          kind: "mock" | "real";
        };
        if (!cancelled) {
          dispatch({
            kind: "set_catalogue",
            servers: data.servers,
            tools: data.tools,
            providerKind: data.kind,
          });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/mcpdeck/history");
      const data = (await res.json()) as { runs: RunSummary[] };
      dispatch({ kind: "set_history", runs: data.runs });
    } catch {
      /* ignore */
    }
  }, []);

  const send = useCallback(async (message: UpstreamMessage) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    await fetch("/api/mcpdeck/input", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message }),
    });
  }, []);

  const start = useCallback(async (goal: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    dispatch({ kind: "reset" });
    dispatch({ kind: "set_status", status: "starting" });

    try {
      const res = await fetch("/api/mcpdeck/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`Engine returned ${res.status}`);
      }
      const sessionId = res.headers.get("X-Session-Id");
      if (sessionId) sessionIdRef.current = sessionId;
      void fetchHistory(); // the new run shows in history immediately

      for await (const ev of parseSse(res.body)) {
        if (ev.type === "session_ready") sessionIdRef.current = ev.sessionId;
        dispatch({ kind: "event", ev });
      }
      void fetchHistory(); // refresh status/summary when it finishes
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      dispatch({ kind: "event", ev: { type: "error", message: msg } });
      void fetchHistory();
    }
  }, [fetchHistory]);

  // Re-open a past run's session and replay its buffered events to rebuild the
  // trace (read-only view; the engine is NOT re-run).
  const loadRun = useCallback(async (sessionId: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    dispatch({ kind: "reset" });
    dispatch({ kind: "set_status", status: "starting" });
    sessionIdRef.current = sessionId;
    try {
      const res = await fetch(`/api/mcpdeck/stream?sessionId=${encodeURIComponent(sessionId)}`, {
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
      for await (const ev of parseSse(res.body)) {
        if (ctrl.signal.aborted) break;
        dispatch({ kind: "event", ev });
      }
    } catch {
      /* aborted or the session is gone */
    }
  }, []);

  // On mount: load the run history and restore the most recent conversation so a
  // reload doesn't lose it (persists until the dev server restarts).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/mcpdeck/history");
        const data = (await res.json()) as { runs: RunSummary[] };
        dispatch({ kind: "set_history", runs: data.runs });
        if (data.runs.length > 0) void loadRun(data.runs[0].sessionId);
      } catch {
        /* ignore */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolveApproval = useCallback(
    (requestId: string, verdict: ApprovalVerdict) =>
      send({ kind: "approval", requestId, verdict }),
    [send],
  );
  const toggleServer = useCallback(
    (serverId: string, enabled: boolean) =>
      send({ kind: "toggle_server", serverId, enabled }),
    [send],
  );
  const pinTool = useCallback(
    (toolId: string, pinned: boolean) => send({ kind: "pin_tool", toolId, pinned }),
    [send],
  );
  const expandResource = useCallback(
    (nodeId: string) => send({ kind: "expand_resource", nodeId }),
    [send],
  );
  const stop = useCallback(() => send({ kind: "stop" }), [send]);
  const replay = useCallback(
    (replayId: string, editedArgs?: Record<string, unknown>) =>
      send({ kind: "replay", replayId, editedArgs }),
    [send],
  );
  const branch = useCallback(
    (replayId: string, newGoal: string) => send({ kind: "branch", replayId, newGoal }),
    [send],
  );

  return {
    state,
    start,
    stop,
    loadRun,
    resolveApproval,
    toggleServer,
    pinTool,
    expandResource,
    replay,
    branch,
  };
}
