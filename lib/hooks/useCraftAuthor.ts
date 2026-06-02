"use client";

import { useCallback, useState } from "react";
import type { CraftBlock } from "@/lib/crafts/craft-block";

export interface AuthoredCraft {
  block: CraftBlock;
  prose: string;
  request: string; // the user's request that produced this craft
}

/** Ask the engine to AUTHOR a live craft for a request (§1–5). */
export function useCraftAuthor() {
  const [crafts, setCrafts] = useState<AuthoredCraft[]>([]);
  const [authoring, setAuthoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);

  const author = useCallback(
    async (request: string, providerId?: string) => {
      setAuthoring(true);
      setError(null);
      try {
        const res = await fetch("/api/crafts/author", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request, thread_id: threadId, providerId }),
        });
        const data = (await res.json()) as {
          block?: CraftBlock;
          prose?: string;
          thread_id?: string;
          error?: string;
        };
        if (!res.ok || !data.block) {
          setError(data.error ?? "The engine couldn't author a craft for that.");
          return;
        }
        if (data.thread_id) setThreadId(data.thread_id);
        setCrafts((cs) => [...cs, { block: data.block!, prose: data.prose ?? "", request }]);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setAuthoring(false);
      }
    },
    [threadId],
  );

  // A craft edited by route:engine (version+1) replaces the prior by id.
  const replace = useCallback((next: CraftBlock) => {
    setCrafts((cs) => cs.map((c) => (c.block.id === next.id ? { ...c, block: next } : c)));
  }, []);

  const reset = useCallback(() => {
    setCrafts([]);
    setThreadId(null);
    setError(null);
  }, []);

  return { crafts, authoring, error, threadId, author, replace, reset };
}
