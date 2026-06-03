"use client";

import { useEffect, useRef } from "react";
import { Brain, Wrench, Check, AlertTriangle, Loader2, Sparkles, ChevronRight, Network } from "lucide-react";
import { InflightApprovalCard } from "./InflightApprovalCard";
import { CraftRenderer } from "@/components/crafts/CraftRenderer";
import type { TraceItem } from "@/lib/hooks/useMcpDeck";
import type { ApprovalVerdict, McpToolInfo, PendingApproval } from "@/lib/mcpdeck/types";
import type { CraftBlock } from "@/lib/crafts/craft-block";

interface Props {
  traces: TraceItem[];
  pending: PendingApproval[];
  crafts: CraftBlock[];
  toolsById: Record<string, McpToolInfo>;
  onResolve: (requestId: string, verdict: ApprovalVerdict) => void;
}

/**
 * "Model Processing" — a live trace of what the model is thinking and which
 * tools it is using across the connected apps. Reasoning renders as thinking
 * blocks; each tool call renders as a card (args + result, auto vs approved);
 * a rendered live panel appears inline; writes await approval at the tail.
 */
export function ModelProcessing({ traces, pending, crafts, toolsById, onResolve }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [traces.length, pending.length]);

  if (traces.length === 0 && pending.length === 0) {
    return <EmptyState />;
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-4">
      <div className="max-w-3xl mx-auto space-y-2.5">
        {traces.map((t) => (
          <TraceRow key={t.id} item={t} crafts={crafts} />
        ))}
        {pending.map((p) => (
          <InflightApprovalCard
            key={p.requestId}
            pending={p}
            hasSideEffect={toolsById[p.toolId]?.hasSideEffect ?? true}
            onResolve={onResolve}
          />
        ))}
      </div>
    </div>
  );
}

function TraceRow({ item, crafts }: { item: TraceItem; crafts: CraftBlock[] }) {
  switch (item.kind) {
    case "reasoning":
      return (
        <div className="flex gap-2.5">
          <Brain className="h-3.5 w-3.5 text-accent shrink-0 mt-1" strokeWidth={1.8} />
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-[var(--foreground)]/90">
            {item.text}
          </p>
        </div>
      );
    case "tool":
      return <ToolCard item={item} />;
    case "craft": {
      const block = crafts.find((c) => c.id === item.blockId);
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-mono text-accent">
            <Sparkles className="h-3 w-3" /> rendered a live panel
          </div>
          {block ? (
            <CraftRenderer block={block} providerId="sonnet" />
          ) : (
            <div className="text-[12px] text-[var(--secondary)]">{item.title}</div>
          )}
        </div>
      );
    }
    case "done":
      return (
        <div
          className={`rounded-lg border px-3.5 py-2.5 text-[13px] leading-relaxed mt-1 ${
            item.level === "error"
              ? "border-red-500/40 bg-red-500/5 text-red-700 dark:text-red-300"
              : "border-emerald-500/40 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300"
          }`}
        >
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-mono mb-1 opacity-80">
            {item.level === "error" ? <AlertTriangle className="h-3 w-3" /> : <Check className="h-3 w-3" />}
            {item.level === "error" ? "error" : "done"}
          </div>
          {item.text}
        </div>
      );
  }
}

function ToolCard({
  item,
}: {
  item: Extract<TraceItem, { kind: "tool" }>;
}) {
  const argStr = safeJson(item.args);
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/50 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <Wrench className="h-3.5 w-3.5 text-[var(--secondary)] shrink-0" strokeWidth={1.8} />
        <span className="font-mono text-[12px] truncate">{item.toolId}</span>
        <span
          className={`text-[9px] font-mono uppercase tracking-[0.15em] px-1.5 py-0.5 rounded-full border ${
            item.write
              ? "border-amber-500/40 text-amber-700 dark:text-amber-400"
              : "border-[var(--border)] text-[var(--secondary)]"
          }`}
        >
          {item.write ? "write" : "auto"}
        </span>
        <span className="ml-auto shrink-0">
          {item.status === "running" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
          ) : item.status === "error" ? (
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
          ) : (
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          )}
        </span>
      </div>
      {argStr !== "{}" && (
        <div className="px-3 pb-1 font-mono text-[10.5px] text-[var(--secondary)] truncate">{argStr}</div>
      )}
      {item.result != null && item.result !== "" && (
        <details className="group border-t border-[var(--border)]">
          <summary className="cursor-pointer list-none px-3 py-1.5 flex items-center gap-1 text-[10.5px] font-mono text-[var(--secondary)] hover:text-[var(--foreground)]">
            <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
            {item.status === "error" ? "error" : "result"}
          </summary>
          <pre
            className={`px-3 pb-2.5 pt-0 text-[11px] whitespace-pre-wrap break-words max-h-64 overflow-y-auto ${
              item.status === "error" ? "text-red-600 dark:text-red-400" : "text-[var(--secondary)]"
            }`}
          >
            {item.result}
          </pre>
        </details>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="max-w-md text-center space-y-3 px-6">
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Network className="h-5 w-5" strokeWidth={1.5} />
        </div>
        <h2 className="font-display text-xl font-bold tracking-tight">Give the agent a goal</h2>
        <p className="text-[13px] leading-relaxed text-[var(--secondary)]">
          It works across your connected apps as one system — resolving ids in one and acting in the
          next. Reads run automatically; you approve writes. You&apos;ll see its reasoning and every
          tool it uses here, live.
        </p>
        <p className="text-[11px] text-[var(--secondary)] pt-1">
          e.g. <span className="text-[var(--foreground)]">&ldquo;Find the issues assigned to me in the
          mobile project and open a PR fixing the top one.&rdquo;</span>
        </p>
      </div>
    </div>
  );
}

function safeJson(args: Record<string, unknown>): string {
  try {
    const s = JSON.stringify(args);
    return s.length > 200 ? `${s.slice(0, 200)}…` : s;
  } catch {
    return "{…}";
  }
}
