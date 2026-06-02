"use client";

import { useEffect, useRef, useState } from "react";
import type { ChannelBinding, ChannelFrame, SubscribeResponse } from "@/lib/channels/wire";

async function* parseSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<ChannelFrame> {
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
        yield JSON.parse(data) as ChannelFrame;
      } catch {
        /* ignore heartbeats / partials */
      }
    }
  }
}

export interface ChannelState {
  /** latest payload per craft-local alias (`as`) */
  data: Record<string, unknown>;
  /** latest rev per alias — proves shared fan-out when two crafts match */
  rev: Record<string, number>;
  connected: boolean;
}

/**
 * Subscribe a craft to one or more channels (fan-in: one SSE, many channels).
 * Returns the latest data + rev per `as` alias, and a route:direct `request`.
 */
export function useChannel(threadId: string, craftId: string, channels: ChannelBinding[]) {
  const [state, setState] = useState<ChannelState>({ data: {}, rev: {}, connected: false });
  const keyByChannel = useRef<Record<string, string>>({});
  const sessionIdRef = useRef<string | null>(null);
  // stable signature so the effect re-subscribes only when the channel set changes
  const sig = JSON.stringify(channels);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    (async () => {
      try {
        const sub = await fetch("/api/channel/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ thread_id: threadId, craft_id: craftId, channels }),
        });
        if (!sub.ok) return;
        const { session_id, channels: chs } = (await sub.json()) as SubscribeResponse;
        sessionIdRef.current = session_id;
        keyByChannel.current = Object.fromEntries(chs.map((c) => [c.channel, c.key]));

        const res = await fetch(`/api/channel/${session_id}/stream`, { signal: ctrl.signal });
        if (!res.ok || !res.body) return;
        if (!cancelled) setState((s) => ({ ...s, connected: true }));
        for await (const frame of parseSse(res.body)) {
          if (cancelled) break;
          setState((s) => ({
            connected: true,
            data: { ...s.data, [frame.as]: frame.payload },
            rev: { ...s.rev, [frame.as]: frame.rev },
          }));
        }
      } catch {
        /* aborted */
      } finally {
        if (!cancelled) setState((s) => ({ ...s, connected: false }));
      }
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, craftId, sig]);

  async function request(channel: string, op: string, args: Record<string, unknown> = {}) {
    // If the channel is a subscribed one, relay through it; otherwise (e.g. a
    // WRITE op like patch-page the craft never subscribes to) use the keyless
    // /call route so the action never silently no-ops on a channel mismatch.
    const key = keyByChannel.current[channel];
    const url = key ? `/api/channel/request/${encodeURIComponent(key)}` : `/api/channel/call`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op, args }),
    });
    return res.json();
  }

  /** Force an immediate re-poll of all this craft's channels; fresh data fans
   *  back over the open SSE so the bound UI updates live. */
  async function refresh(): Promise<void> {
    const sid = sessionIdRef.current;
    if (!sid) return;
    await fetch(`/api/channel/${sid}/refresh`, { method: "POST" }).catch(() => undefined);
  }

  return { state, request, refresh };
}
