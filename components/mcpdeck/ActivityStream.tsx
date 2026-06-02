"use client";

import { useEffect, useRef } from "react";
import { Brain } from "lucide-react";
import { InflightApprovalCard } from "./InflightApprovalCard";
import type {
  ApprovalVerdict,
  EngineThought,
  McpToolInfo,
  PendingApproval,
} from "@/lib/mcpdeck/types";

interface ActivityLine {
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

interface Props {
  activity: ActivityLine[];
  pending: PendingApproval[];
  toolsById: Record<string, McpToolInfo>;
  onResolve: (requestId: string, verdict: ApprovalVerdict) => void;
}

export function ActivityStream({ activity, pending, toolsById, onResolve }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [activity.length, pending.length]);

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-4 space-y-2">
      {activity.length === 0 && pending.length === 0 && <EmptyStateHowItWorks />}

      {activity.map((line) => (
        <ActivityRow key={line.id} line={line} />
      ))}

      {pending.map((p) => (
        <InflightApprovalCard
          key={p.requestId}
          pending={p}
          hasSideEffect={toolsById[p.toolId]?.hasSideEffect ?? false}
          onResolve={onResolve}
        />
      ))}
    </div>
  );
}

function EmptyStateHowItWorks() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="max-w-md text-center space-y-3 px-6">
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Brain className="h-5 w-5" strokeWidth={1.5} />
        </div>
        <h2 className="font-display text-xl font-bold tracking-tight">Give the agent a goal</h2>
        <p className="text-[13px] leading-relaxed text-[var(--secondary)]">
          It works toward your goal with the MCP tools on the left — pausing for your approval before
          every call. Approve, edit the args, or deny; the loop resumes the instant you decide.
        </p>
        <p className="text-[11px] text-[var(--secondary)] pt-1">
          Pick a sample below or type your own. For live read-only views of each server, switch to{" "}
          <span className="font-medium text-[var(--foreground)]">Apps</span>.
        </p>
      </div>
    </div>
  );
}

function ThoughtCard({ thought }: { thought: EngineThought }) {
  return (
    <div className="rounded border border-dashed border-[var(--border)] bg-[var(--surface-2)]/60 px-3 py-2 space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] font-mono text-[var(--secondary)]">
        <Brain className="h-3 w-3" strokeWidth={1.5} />
        Loop · reads MCP state
      </div>
      <div className="text-[12px] leading-relaxed">{thought.intent}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] font-mono">
        <ContextChunk label="servers" items={thought.enabledServers} />
        {thought.pinnedTools.length > 0 && (
          <ContextChunk label="pinned" items={thought.pinnedTools} />
        )}
        {thought.openResources.length > 0 && (
          <ContextChunk
            label="open resources"
            items={[`${thought.openResources.length}`]}
          />
        )}
        {thought.recentCalls.length > 0 && (
          <ContextChunk
            label="last result"
            items={[
              `${thought.recentCalls[thought.recentCalls.length - 1].toolId}${
                thought.recentCalls[thought.recentCalls.length - 1].isError ? " [err]" : ""
              }`,
            ]}
          />
        )}
      </div>
    </div>
  );
}

function ContextChunk({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[var(--secondary)] uppercase tracking-[0.2em]">{label}</span>
      <span className="text-[var(--foreground)]">{items.join(", ") || "—"}</span>
    </div>
  );
}

function ActivityRow({ line }: { line: ActivityLine }) {
  switch (line.kind) {
    case "iteration":
      return (
        <div className="text-[10px] uppercase tracking-[0.25em] font-mono text-[var(--secondary)] pt-2">
          {line.text}
        </div>
      );
    case "thought":
      return line.thought ? <ThoughtCard thought={line.thought} /> : null;
    case "text":
      return (
        <div className="text-[13px] leading-relaxed whitespace-pre-wrap">{line.text}</div>
      );
    case "tool_started":
      return (
        <div className="font-mono text-[11px] text-[var(--secondary)] pl-2 border-l-2 border-accent/40">
          {line.text}
        </div>
      );
    case "tool_completed":
      return (
        <div
          className={`font-mono text-[11px] pl-2 border-l-2 border-[var(--border)] ${
            line.level === "error" ? "text-red-600 dark:text-red-400" : "text-[var(--secondary)]"
          }`}
        >
          {line.text}
        </div>
      );
    case "approval":
      return (
        <div className="font-mono text-[11px] text-accent pl-2 border-l-2 border-accent">
          {line.text}
        </div>
      );
    case "done":
      return (
        <div
          className={`rounded border px-3 py-2 text-[12px] mt-2 ${
            line.level === "error"
              ? "border-red-500/40 bg-red-500/5 text-red-700 dark:text-red-300"
              : "border-emerald-500/40 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300"
          }`}
        >
          {line.text}
        </div>
      );
    case "log":
      return (
        <div
          className={`font-mono text-[10px] ${
            line.level === "error"
              ? "text-red-600 dark:text-red-400"
              : line.level === "warn"
                ? "text-amber-700 dark:text-amber-400"
                : "text-[var(--secondary)]"
          }`}
        >
          {line.text}
        </div>
      );
  }
}
