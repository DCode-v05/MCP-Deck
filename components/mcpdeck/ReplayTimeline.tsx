"use client";

import { useState } from "react";
import { Check, X, AlertCircle, ArrowRightCircle, RotateCw, GitBranch } from "lucide-react";
import type { ReplayEntry } from "@/lib/mcpdeck/types";

interface Props {
  entries: ReplayEntry[];
  onReplay: (replayId: string, editedArgs?: Record<string, unknown>) => void;
  onBranch: (replayId: string, newGoal: string) => void;
  busy: boolean;
}

export function ReplayTimeline({ entries, onReplay, onBranch, busy }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [branchGoal, setBranchGoal] = useState("");
  const [branchFor, setBranchFor] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <h3 className="text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--secondary)] px-0.5">
        Replay
      </h3>
      <div className="space-y-1.5">
        {entries.length === 0 && (
          <div className="text-[11px] text-[var(--secondary)] px-1">no tool calls yet</div>
        )}
        {entries
          .slice()
          .reverse()
          .map((e) => {
            const isOpen = openId === e.id;
            const isBranching = branchFor === e.id;
            return (
              <div
                key={e.id}
                className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5"
              >
                <button
                  onClick={() => setOpenId(isOpen ? null : e.id)}
                  className="w-full flex items-center gap-2 text-[11px] font-mono text-left"
                >
                  <VerdictIcon verdict={e.verdict} isError={e.isError} />
                  <span className="text-[var(--secondary)]">i{e.iteration}</span>
                  <span className="truncate font-medium flex-1">{e.toolId}</span>
                  {e.argsEdited && (
                    <span className="text-[9px] uppercase tracking-[0.2em] text-amber-700 dark:text-amber-400">
                      edited
                    </span>
                  )}
                </button>
                {e.result && (
                  <div className="mt-1 font-mono text-[10px] text-[var(--secondary)] line-clamp-2">
                    {e.result}
                  </div>
                )}

                {isOpen && (
                  <div className="mt-2 pt-2 border-t border-[var(--border)] space-y-1.5">
                    <div className="font-mono text-[10px] text-[var(--secondary)]">
                      args: {JSON.stringify(e.args)}
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => onReplay(e.id)}
                        disabled={busy}
                        title="Re-run this exact call"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[var(--border)] text-[10px] hover:border-accent/40 disabled:opacity-40"
                      >
                        <RotateCw className="h-2.5 w-2.5" /> Re-run
                      </button>
                      <button
                        onClick={() => {
                          setBranchFor(isBranching ? null : e.id);
                          setBranchGoal("");
                        }}
                        disabled={busy}
                        title="Start a new run seeded with everything up to this call"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[var(--border)] text-[10px] hover:border-accent/40 disabled:opacity-40"
                      >
                        <GitBranch className="h-2.5 w-2.5" /> Branch
                      </button>
                    </div>
                    {isBranching && (
                      <div className="space-y-1">
                        <input
                          value={branchGoal}
                          onChange={(ev) => setBranchGoal(ev.target.value)}
                          placeholder="new goal from here…"
                          className="w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-[11px] focus:outline-none focus:border-accent"
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter" && branchGoal.trim()) {
                              onBranch(e.id, branchGoal.trim());
                              setBranchFor(null);
                            }
                          }}
                        />
                        <button
                          onClick={() => {
                            if (!branchGoal.trim()) return;
                            onBranch(e.id, branchGoal.trim());
                            setBranchFor(null);
                          }}
                          disabled={!branchGoal.trim()}
                          className="w-full px-2 py-1 rounded bg-accent text-white text-[10px] font-medium disabled:opacity-40 hover:bg-accent/90"
                        >
                          Branch from here
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

function VerdictIcon({ verdict, isError }: { verdict: ReplayEntry["verdict"]; isError: boolean }) {
  if (isError) return <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />;
  if (verdict === "denied") return <X className="h-3 w-3 text-[var(--secondary)] shrink-0" />;
  if (verdict === "auto") return <ArrowRightCircle className="h-3 w-3 text-emerald-600 shrink-0" />;
  return <Check className="h-3 w-3 text-emerald-600 shrink-0" />;
}
