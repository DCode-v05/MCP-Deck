"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type {
  ApprovalVerdict,
  EngineThought,
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

export interface ActivityLine {
  id: string;
  ts: number;
  kind:
    | "iteration"
    | "text"
    | "tool_started"
    | "tool_completed"
    | "log"
    | "approval"
    | "thought"
    | "done";
  text: string;
  level?: "info" | "warn" | "error";
  thought?: EngineThought;
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
  activity: ActivityLine[];
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
  activity: [],
  usage: null,
  usageStats: null,
  finalSummary: null,
  error: null,
};

type Action =
  | { kind: "reset" }
  | { kind: "set_status"; status: McpDeckState["status"] }
  | { kind: "set_catalogue"; servers: McpServerInfo[]; tools: McpToolInfo[]; providerKind: "mock" | "real" }
  | { kind: "event"; ev: McpDeckEvent };

function reducer(state: McpDeckState, action: Action): McpDeckState {
  switch (action.kind) {
    case "reset":
      return { ...INITIAL_STATE, catalogue: state.catalogue };
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
        activity: pushActivity(state.activity, {
          kind: "approval",
          text: `Approval requested: ${ev.pending.toolId}`,
          level: "info",
        }),
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
      return {
        ...state,
        replay: [...state.replay, entry],
        activity: pushActivity(state.activity, {
          kind: "tool_started",
          text: `→ ${ev.toolId} ${shortArgs(ev.args)}`,
        }),
      };
    }
    case "tool_completed": {
      const replay = state.replay.map((r) =>
        r.id === ev.replayId
          ? { ...r, result: ev.result, isError: ev.isError, completedAt: Date.now() }
          : r,
      );
      return {
        ...state,
        replay,
        activity: pushActivity(state.activity, {
          kind: "tool_completed",
          text: `← ${preview(ev.result)}${ev.isError ? "  [error]" : ""}`,
          level: ev.isError ? "error" : undefined,
        }),
      };
    }
    case "engine_text":
      return {
        ...state,
        activity: appendOrPushText(state.activity, ev.text),
      };
    case "engine_iteration":
      return {
        ...state,
        iteration: ev.iteration,
        goal: ev.goal,
        activity: ev.iteration === 0 ? state.activity : pushActivity(state.activity, {
          kind: "iteration",
          text: `— iteration ${ev.iteration} —`,
        }),
      };
    case "engine_thought":
      return {
        ...state,
        activity: pushActivity(state.activity, {
          kind: "thought",
          text: ev.thought.intent,
          thought: ev.thought,
        }),
      };
    case "engine_done":
      return {
        ...state,
        status: ev.reason === "error" ? "error" : "completed",
        finalSummary: ev.summary,
        activity: pushActivity(state.activity, {
          kind: "done",
          text: ev.summary ?? (ev.reason === "stopped" ? "stopped" : "done"),
          level: ev.reason === "error" ? "error" : "info",
        }),
      };
    case "usage":
      return {
        ...state,
        usage: {
          inputTokens: ev.inputTokens,
          outputTokens: ev.outputTokens,
          totalCost: ev.totalCost,
        },
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
      return {
        ...state,
        activity: pushActivity(state.activity, {
          kind: "log",
          text: ev.message,
          level: ev.level,
        }),
      };
    case "error":
      return {
        ...state,
        status: "error",
        error: ev.message,
        activity: pushActivity(state.activity, {
          kind: "log",
          text: ev.message,
          level: "error",
        }),
      };
  }
}

function pushActivity(
  prev: ActivityLine[],
  partial: Omit<ActivityLine, "id" | "ts">,
): ActivityLine[] {
  const next: ActivityLine = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ts: Date.now(),
    ...partial,
  };
  const arr = [...prev, next];
  return arr.length > 400 ? arr.slice(arr.length - 400) : arr;
}

function appendOrPushText(prev: ActivityLine[], text: string): ActivityLine[] {
  const last = prev[prev.length - 1];
  if (last && last.kind === "text") {
    const merged: ActivityLine = { ...last, text: last.text + text };
    return [...prev.slice(0, -1), merged];
  }
  return pushActivity(prev, { kind: "text", text });
}

function preview(s: string): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > 120 ? `${flat.slice(0, 120)}…` : flat;
}

function shortArgs(args: Record<string, unknown>): string {
  const s = JSON.stringify(args);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
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

      for await (const ev of parseSse(res.body)) {
        if (ev.type === "session_ready") sessionIdRef.current = ev.sessionId;
        dispatch({ kind: "event", ev });
      }
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      dispatch({ kind: "event", ev: { type: "error", message: msg } });
    }
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
    resolveApproval,
    toggleServer,
    pinTool,
    expandResource,
    replay,
    branch,
  };
}
