"use client";

import { useEffect, useState } from "react";
import { Check, X, Shield } from "lucide-react";
import type { ApprovalVerdict, PendingApproval } from "@/lib/mcpdeck/types";

interface Props {
  pending: PendingApproval;
  hasSideEffect: boolean;
  onResolve: (requestId: string, verdict: ApprovalVerdict) => void;
}

export function InflightApprovalCard({ pending, hasSideEffect, onResolve }: Props) {
  const [argsJson, setArgsJson] = useState(() => JSON.stringify(pending.args, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);

  // If the engine re-emits the same pending (snapshot replay), keep the form state.
  useEffect(() => {
    setArgsJson(JSON.stringify(pending.args, null, 2));
    setParseError(null);
  }, [pending.requestId]); // eslint-disable-line react-hooks/exhaustive-deps

  const parse = (): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(argsJson);
      if (v === null || typeof v !== "object" || Array.isArray(v)) {
        setParseError("args must be a JSON object");
        return null;
      }
      setParseError(null);
      return v as Record<string, unknown>;
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
      return null;
    }
  };

  const approve = (remember: boolean) => {
    const args = parse();
    if (!args) return;
    onResolve(pending.requestId, {
      kind: remember ? "approve_remember" : "approve",
      args,
    });
  };

  const deny = () => {
    onResolve(pending.requestId, { kind: "deny" });
  };

  return (
    <div className="rounded-lg border-2 border-accent/40 bg-accent/5 p-3 space-y-2 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-accent" strokeWidth={1.5} />
          <span className="font-medium text-sm">Engine is paused — your turn</span>
          {hasSideEffect && (
            <span className="text-[9px] uppercase tracking-[0.2em] font-mono text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/40">
              side-effect
            </span>
          )}
        </div>
        <span className="font-mono text-[10px] text-[var(--secondary)]">
          {pending.serverId} / {pending.toolId}
        </span>
      </div>

      <p className="text-[11.5px] leading-relaxed text-[var(--secondary)]">
        The agent wants to call <span className="font-mono text-accent">{pending.toolId}</span>
        {hasSideEffect ? " — this tool has real side effects" : ""}. Review the args below, then
        choose:
      </p>

      <div className="text-[11px] uppercase tracking-[0.2em] font-mono text-[var(--secondary)]">
        Args — edit JSON if you want different inputs
      </div>
      <textarea
        value={argsJson}
        onChange={(e) => setArgsJson(e.target.value)}
        spellCheck={false}
        className="w-full min-h-[88px] rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-xs leading-relaxed resize-y focus:outline-none focus:border-accent"
      />
      {parseError && (
        <div className="text-[11px] text-red-600 dark:text-red-400 font-mono">
          {parseError}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 pt-1">
        <button
          onClick={() => approve(false)}
          title="Run the tool with the args above, then the engine continues."
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-accent text-white text-[11px] font-medium hover:bg-accent/90"
        >
          <Check className="h-3 w-3" strokeWidth={2} />
          Approve
        </button>
        <button
          onClick={() => approve(true)}
          title="Approve this call AND auto-approve every future call of this tool in this session."
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-accent/40 text-accent text-[11px] font-medium hover:bg-accent/10"
        >
          Approve &amp; remember
        </button>
        <button
          onClick={deny}
          title="Block this tool call. The engine sees the denial and will try a different approach."
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[var(--border)] text-[var(--secondary)] hover:text-[var(--foreground)] text-[11px] font-medium"
        >
          <X className="h-3 w-3" strokeWidth={2} />
          Deny
        </button>
      </div>

      <ul className="text-[10.5px] leading-snug text-[var(--secondary)] space-y-0.5 pt-1 border-t border-[var(--border)]">
        <li>
          <span className="text-[var(--foreground)] font-medium">Approve</span> — run with the args
          shown.
        </li>
        <li>
          <span className="text-[var(--foreground)] font-medium">Approve &amp; remember</span> —
          auto-approve this tool for the rest of the session.
        </li>
        <li>
          <span className="text-[var(--foreground)] font-medium">Deny</span> — block it; the engine
          will reconsider and pick another approach.
        </li>
      </ul>
    </div>
  );
}
