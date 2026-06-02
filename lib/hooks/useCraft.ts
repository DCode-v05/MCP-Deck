"use client";

import { useCallback, useState } from "react";
import type { CraftAction, CraftDataSource, CraftSpec } from "@/lib/mcpdeck/craft";

export interface SourceState {
  loading: boolean;
  result: string | null;
  isError: boolean;
}

export interface ActionOutcome {
  actionId: string;
  ok: boolean;
  message: string;
}

interface GenerateResponse {
  craftId: string;
  spec: CraftSpec;
  raw: string;
  providerKind: "mock" | "real";
  error?: string;
}

export function useCraft() {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [craftId, setCraftId] = useState<string | null>(null);
  const [spec, setSpec] = useState<CraftSpec | null>(null);
  const [raw, setRaw] = useState<string | null>(null);
  const [providerKind, setProviderKind] = useState<"mock" | "real">("mock");
  const [sources, setSources] = useState<Record<string, SourceState>>({});
  const [actionRunning, setActionRunning] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null);

  const runSource = useCallback(async (id: string, src: CraftDataSource, cid: string) => {
    setSources((prev) => ({ ...prev, [id]: { loading: true, result: null, isError: false } }));
    try {
      const res = await fetch("/api/mcpdeck/craft/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ craftId: cid, toolId: src.toolId, args: src.args }),
      });
      const data = (await res.json()) as { result: string; isError: boolean };
      setSources((prev) => ({
        ...prev,
        [id]: { loading: false, result: data.result, isError: Boolean(data.isError) },
      }));
    } catch (e) {
      setSources((prev) => ({
        ...prev,
        [id]: { loading: false, result: e instanceof Error ? e.message : String(e), isError: true },
      }));
    }
  }, []);

  const generate = useCallback(
    async (prompt: string) => {
      setGenerating(true);
      setError(null);
      setOutcome(null);
      setSources({});
      setSpec(null);
      try {
        const res = await fetch("/api/mcpdeck/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });
        const data = (await res.json()) as GenerateResponse;
        if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
        setCraftId(data.craftId);
        setSpec(data.spec);
        setRaw(data.raw);
        setProviderKind(data.providerKind);
        // Auto-run all read-only data sources to populate the live app.
        for (const src of data.spec.dataSources) {
          void runSource(src.id, src, data.craftId);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setGenerating(false);
      }
    },
    [runSource],
  );

  const refreshSource = useCallback(
    (src: CraftDataSource) => {
      if (craftId) void runSource(src.id, src, craftId);
    },
    [craftId, runSource],
  );

  const runAction = useCallback(
    async (action: CraftAction, args: Record<string, unknown>) => {
      if (!craftId) return;
      setActionRunning(action.id);
      setOutcome(null);
      try {
        const res = await fetch("/api/mcpdeck/craft/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ craftId, toolId: action.toolId, args }),
        });
        const data = (await res.json()) as { result: string; isError: boolean };
        setOutcome({ actionId: action.id, ok: !data.isError, message: data.result });
        // Re-pull data sources so the dashboard reflects the side effect.
        if (spec) for (const src of spec.dataSources) void runSource(src.id, src, craftId);
      } catch (e) {
        setOutcome({ actionId: action.id, ok: false, message: e instanceof Error ? e.message : String(e) });
      } finally {
        setActionRunning(null);
      }
    },
    [craftId, spec, runSource],
  );

  return {
    generating,
    error,
    craftId,
    spec,
    raw,
    providerKind,
    sources,
    actionRunning,
    outcome,
    generate,
    refreshSource,
    runAction,
  };
}
