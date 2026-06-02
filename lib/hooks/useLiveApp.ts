"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ActionResult,
  AppState,
  FieldValue,
  LiveAppEvent,
  LiveAppMessage,
  LiveAppStatePayload,
  PendingAction,
} from "@/lib/apps/kit/types";

async function* parseSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<LiveAppEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let data = "";
      for (const line of block.split("\n")) if (line.startsWith("data:")) data += line.slice(5).trim();
      if (!data) continue;
      try {
        yield JSON.parse(data) as LiveAppEvent;
      } catch {
        /* ignore */
      }
    }
  }
}

export function useLiveApp(appId: string) {
  const [state, setState] = useState<LiveAppStatePayload | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/apps/${appId}/open`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) return;
        const sid = res.headers.get("X-Session-Id");
        if (sid) sessionIdRef.current = sid;
        for await (const ev of parseSse(res.body)) {
          switch (ev.type) {
            case "session_ready":
              sessionIdRef.current = ev.sessionId;
              break;
            case "state":
              setState(ev.payload);
              break;
            case "action_pending":
              setPending(ev.pending);
              break;
            case "action_running":
              setRunning(true);
              break;
            case "action_result":
              setRunning(false);
              setPending(null);
              setResult(ev.result);
              break;
          }
        }
      } catch {
        /* aborted */
      }
    })();
    return () => ctrl.abort();
  }, [appId]);

  const send = useCallback(
    async (message: LiveAppMessage) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      await fetch(`/api/apps/${appId}/input`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message }),
      });
    },
    [appId],
  );

  const setField = useCallback((key: string, value: FieldValue) => send({ kind: "set_field", key, value }), [send]);
  const setFields = useCallback((values: AppState) => send({ kind: "set_fields", values }), [send]);
  const runAction = useCallback(() => {
    setResult(null);
    return send({ kind: "run_action" });
  }, [send]);
  const resolveAction = useCallback(
    (actionId: string, approve: boolean) => send({ kind: "resolve_action", actionId, approve }),
    [send],
  );

  return { state, pending, running, result, setField, setFields, runAction, resolveAction };
}
