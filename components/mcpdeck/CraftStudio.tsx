"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Wand2,
  ArrowLeft,
  RefreshCw,
  Shield,
  X,
  ArrowRight,
  Code2,
  Database,
  Zap,
} from "lucide-react";
import { useCraft } from "@/lib/hooks/useCraft";
import type { CraftAction, CraftBlock, CraftSpec } from "@/lib/mcpdeck/craft";

const SAMPLE_PROMPTS = [
  "A live board of my Linear todo issues, with a button to comment on ENG-198.",
  "Show git working-tree status and the 5 most recent commits, plus a button to create a release branch.",
  "List the workspace files and read the README, with a button to write a CONTRIBUTING.md.",
  "A dashboard of in-progress Linear issues with a button to create a new ENG bug.",
];

export function CraftStudio() {
  const { generating, error, spec, raw, providerKind, sources, actionRunning, outcome, generate, refreshSource, runAction } =
    useCraft();
  const [prompt, setPrompt] = useState("");
  const [showSpec, setShowSpec] = useState(false);
  const [approving, setApproving] = useState<CraftAction | null>(null);

  const submit = (p: string) => {
    if (!p.trim() || generating) return;
    void generate(p.trim());
  };

  const accent = spec?.accent ?? "#EC3B4A";

  return (
    <div className="flex flex-col h-full bg-[var(--background)]">
      <div className="h-1" style={{ background: accent }} />
      <header className="border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-md px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-[var(--secondary)] hover:text-[var(--foreground)] inline-flex items-center gap-1 text-[11px] font-mono">
              <ArrowLeft className="h-3.5 w-3.5" /> McpDeck
            </Link>
            <span className="h-4 w-px bg-[var(--border)]" />
            <Wand2 className="h-5 w-5 text-accent" strokeWidth={1.6} />
            <div>
              <h1 className="font-display text-lg font-bold tracking-tight leading-none">App Generator</h1>
              <span className="text-[10px] uppercase tracking-[0.2em] font-mono text-[var(--secondary)]">
                Engine authors a live MCP app from a prompt
              </span>
            </div>
          </div>
          <span className="text-[10px] font-mono text-[var(--secondary)]">
            MCP: {providerKind === "real" ? "real servers" : "mock (fs/git/linear)"}
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">
          {/* Prompt */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
            <div className="text-[10px] uppercase tracking-[0.25em] font-mono text-[var(--secondary)]">
              Describe the app you want — the engine builds it against live MCP tools
            </div>
            <div className="flex items-end gap-2">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={2}
                disabled={generating}
                placeholder="e.g. A live board of my Linear todos with a button to comment on an issue."
                onKeyDown={(e) => {
                  // Enter sends; Shift+Enter inserts a newline.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit(prompt);
                  }
                }}
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm resize-none focus:outline-none focus:border-accent disabled:opacity-50"
              />
              <button
                onClick={() => submit(prompt)}
                disabled={!prompt.trim() || generating}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-40 hover:bg-accent/90"
              >
                <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
                {generating ? "Generating…" : "Generate"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SAMPLE_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setPrompt(p);
                    submit(p);
                  }}
                  disabled={generating}
                  className="text-[11px] px-2 py-1 rounded-full border border-[var(--border)] text-[var(--secondary)] hover:text-accent hover:border-accent/40 disabled:opacity-40 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {generating && !spec && (
            <div className="text-[13px] text-[var(--secondary)] italic">
              The engine is authoring your app and wiring it to MCP tools…
            </div>
          )}

          {spec && (
            <GeneratedCraft
              spec={spec}
              accent={accent}
              sources={sources}
              actionRunning={actionRunning}
              outcome={outcome}
              onRefresh={refreshSource}
              onAction={(a) => setApproving(a)}
              raw={raw}
              showSpec={showSpec}
              onToggleSpec={() => setShowSpec((v) => !v)}
            />
          )}
        </div>
      </div>

      {approving && (
        <ActionApproval
          action={approving}
          accent={accent}
          running={actionRunning === approving.id}
          onApprove={(args) => {
            void runAction(approving, args);
            setApproving(null);
          }}
          onCancel={() => setApproving(null)}
        />
      )}
    </div>
  );
}

function GeneratedCraft({
  spec,
  accent,
  sources,
  actionRunning,
  outcome,
  onRefresh,
  onAction,
  raw,
  showSpec,
  onToggleSpec,
}: {
  spec: CraftSpec;
  accent: string;
  sources: Record<string, { loading: boolean; result: string | null; isError: boolean }>;
  actionRunning: string | null;
  outcome: { actionId: string; ok: boolean; message: string } | null;
  onRefresh: (src: CraftSpec["dataSources"][number]) => void;
  onAction: (a: CraftAction) => void;
  raw: string | null;
  showSpec: boolean;
  onToggleSpec: () => void;
}) {
  const srcById = Object.fromEntries(spec.dataSources.map((d) => [d.id, d]));

  return (
    <div className="space-y-4">
      {/* App header */}
      <div className="rounded-xl border p-4" style={{ background: `${accent}0D`, borderColor: `${accent}33` }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] font-mono text-[var(--secondary)]">
              Engine-generated app
            </div>
            <h2 className="font-display text-2xl font-bold tracking-tight mt-0.5">{spec.title}</h2>
            <p className="text-[13px] text-[var(--secondary)] mt-1">{spec.summary}</p>
          </div>
          <button
            onClick={onToggleSpec}
            className="inline-flex items-center gap-1 text-[10px] font-mono text-[var(--secondary)] hover:text-accent"
          >
            <Code2 className="h-3.5 w-3.5" /> {showSpec ? "hide" : "view"} spec
          </button>
        </div>
        {showSpec && (
          <pre className="mt-3 max-h-64 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-[10px] font-mono leading-relaxed">
            {raw ?? JSON.stringify(spec, null, 2)}
          </pre>
        )}
      </div>

      {/* Blocks (engine → UI, bound to MCP data) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {spec.blocks.map((b, i) => (
          <BlockView
            key={i}
            block={b}
            src={b.kind !== "text" ? srcById[b.source] : undefined}
            state={b.kind !== "text" ? sources[b.source] : undefined}
            accent={accent}
            onRefresh={onRefresh}
          />
        ))}
      </div>

      {/* Actions (engine → real world, approval-gated) */}
      {spec.actions.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-mono text-amber-700 dark:text-amber-400">
            <span className="h-2 w-2 rounded-full bg-amber-500" /> Actions · ask before running
          </div>
          <div className="flex flex-wrap gap-2">
            {spec.actions.map((a) => (
              <button
                key={a.id}
                onClick={() => onAction(a)}
                disabled={actionRunning === a.id}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-40 hover:opacity-90"
                style={{ background: accent }}
              >
                <Zap className="h-3.5 w-3.5" strokeWidth={2} />
                {actionRunning === a.id ? "Running…" : a.label}
              </button>
            ))}
          </div>
          {outcome && (
            <div
              className={`rounded border px-2.5 py-2 text-[12px] ${
                outcome.ok
                  ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300"
                  : "border-red-500/40 bg-red-500/5 text-red-700 dark:text-red-300"
              }`}
            >
              {outcome.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BlockView({
  block,
  src,
  state,
  accent,
  onRefresh,
}: {
  block: CraftBlock;
  src?: CraftSpec["dataSources"][number];
  state?: { loading: boolean; result: string | null; isError: boolean };
  accent: string;
  onRefresh: (src: CraftSpec["dataSources"][number]) => void;
}) {
  if (block.kind === "text") {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="text-[10px] uppercase tracking-[0.2em] font-mono text-[var(--secondary)] mb-1">{block.title}</div>
        <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{block.text}</p>
      </div>
    );
  }

  const result = state?.result ?? "";
  const lines = result.split("\n").filter((l) => l.trim().length > 0);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-mono text-[var(--secondary)]">
          <Database className="h-3 w-3" style={{ color: accent }} /> {block.title}
        </div>
        {src && (
          <button
            onClick={() => onRefresh(src)}
            className="text-[var(--secondary)] hover:text-accent"
            title={`re-run ${src.toolId}`}
          >
            <RefreshCw className={`h-3 w-3 ${state?.loading ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>
      {src && (
        <div className="font-mono text-[9px] text-[var(--secondary)]">
          {src.toolId}({JSON.stringify(src.args)})
        </div>
      )}

      {state?.loading && <div className="text-[12px] text-[var(--secondary)] italic">loading…</div>}
      {!state?.loading && state?.isError && (
        <div className="text-[12px] text-red-600 dark:text-red-400">{result}</div>
      )}
      {!state?.loading && !state?.isError && state?.result != null && (
        <RenderBlockBody kind={block.kind} lines={lines} raw={result} accent={accent} />
      )}
    </div>
  );
}

function RenderBlockBody({
  kind,
  lines,
  raw,
  accent,
}: {
  kind: "stat" | "table" | "list" | "source";
  lines: string[];
  raw: string;
  accent: string;
}) {
  if (kind === "stat") {
    return (
      <div className="font-display text-2xl font-bold tracking-tight" style={{ color: accent }}>
        {lines[0] ?? raw}
      </div>
    );
  }
  if (kind === "list" || kind === "table") {
    return (
      <ul className="space-y-1">
        {lines.map((l, i) => (
          <li key={i} className="text-[12px] font-mono flex gap-2">
            <span className="text-[var(--secondary)]">{kind === "table" ? "·" : "–"}</span>
            <span className="truncate">{l}</span>
          </li>
        ))}
      </ul>
    );
  }
  return <pre className="text-[11px] font-mono whitespace-pre-wrap leading-relaxed">{raw}</pre>;
}

function ActionApproval({
  action,
  accent,
  running,
  onApprove,
  onCancel,
}: {
  action: CraftAction;
  accent: string;
  running: boolean;
  onApprove: (args: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [argsJson, setArgsJson] = useState(JSON.stringify(action.args, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);

  const approve = () => {
    try {
      const parsed = JSON.parse(argsJson);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        setParseError("args must be a JSON object");
        return;
      }
      onApprove(parsed as Record<string, unknown>);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={onCancel}>
      <div
        className="max-w-md w-full rounded-xl border-2 bg-[var(--surface)] p-5 space-y-3 shadow-xl"
        style={{ borderColor: `${accent}66` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5" strokeWidth={1.5} style={{ color: accent }} />
          <h3 className="font-medium">Approve action</h3>
          {action.sideEffect && (
            <span className="text-[9px] uppercase tracking-[0.2em] font-mono text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/40">
              side-effect
            </span>
          )}
          <button onClick={onCancel} className="ml-auto text-[var(--secondary)] hover:text-[var(--foreground)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[12px] text-[var(--secondary)] leading-relaxed">
          The engine wants to call <span className="font-mono" style={{ color: accent }}>{action.toolId}</span>.
          Review/edit the args, then approve.
        </p>
        <textarea
          value={argsJson}
          onChange={(e) => setArgsJson(e.target.value)}
          spellCheck={false}
          className="w-full min-h-[90px] rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 font-mono text-xs resize-y focus:outline-none focus:border-accent"
        />
        {parseError && <div className="text-[11px] text-red-600 dark:text-red-400 font-mono">{parseError}</div>}
        <div className="flex gap-2">
          <button
            onClick={approve}
            disabled={running}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-40 hover:opacity-90"
            style={{ background: accent }}
          >
            {running ? "Running…" : action.label} <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--secondary)] hover:text-[var(--foreground)]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
