"use client";

import { useMemo, useState } from "react";
import { Sparkles, Square, Play, Brain, CreditCard, HelpCircle, X, Wand2, Bot, LayoutGrid, PanelsTopLeft, History } from "lucide-react";
import Link from "next/link";
import { useMcpDeck, type RunSummary } from "@/lib/hooks/useMcpDeck";
import { ServerPanel } from "./ServerPanel";
import { ToolInspector } from "./ToolInspector";
import { ModelProcessing } from "./ModelProcessing";
import { UsageDashboard } from "./UsageDashboard";
import { AppsMode } from "./apps/AppsMode";

type Tab = "processing" | "usage";
type Mode = "agent" | "apps";

export function McpDeckPanel() {
  const {
    state,
    start,
    stop,
    loadRun,
    resolveApproval,
    toggleServer,
    pinTool,
  } = useMcpDeck();
  const [goal, setGoal] = useState("");
  const [tab, setTab] = useState<Tab>("processing");
  const [mode, setMode] = useState<Mode>("agent");
  const [railsOpen, setRailsOpen] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);

  const toolsById = useMemo(() => {
    const m: Record<string, (typeof state.catalogue.tools)[number]> = {};
    for (const t of state.catalogue.tools) m[t.id] = t;
    return m;
  }, [state.catalogue.tools]);

  const enabledServerIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of Object.values(state.servers)) {
      if (s.enabled) set.add(s.id);
    }
    return set;
  }, [state.servers]);

  const isRunning =
    state.status === "running" ||
    state.status === "awaiting_input" ||
    state.status === "starting";

  // Every prompt runs the multi-step agent across the connected apps.
  const submit = (text: string) => {
    if (!text.trim() || isRunning) return;
    void start(text.trim());
    setGoal("");
  };

  return (
    <div className="flex flex-col h-full bg-[var(--background)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-md px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-accent" strokeWidth={1.5} />
          <h1 className="font-display text-xl font-bold tracking-tight">McpDeck</h1>
          <StatusPill status={state.status} />
          <ProviderBadge kind={state.providerKind} />
          <button
            onClick={() => setHelpOpen(true)}
            className="text-[var(--secondary)] hover:text-accent"
            title="What is McpDeck?"
          >
            <HelpCircle className="h-4 w-4" strokeWidth={1.5} />
          </button>
          {mode === "agent" && (
            <button
              onClick={() => setRailsOpen((v) => !v)}
              className="text-[var(--secondary)] hover:text-accent"
              title={railsOpen ? "Hide side rails (focus the activity stream)" : "Show side rails"}
            >
              <PanelsTopLeft className="h-4 w-4" strokeWidth={1.5} />
            </button>
          )}

          {/* Mode switch: Agent cockpit vs Apps dashboards */}
          <div className="ml-2 flex items-center gap-0.5 rounded-lg border border-[var(--border)] p-0.5">
            <ModeButton active={mode === "agent"} onClick={() => setMode("agent")} icon={Bot}>
              Agent
            </ModeButton>
            <ModeButton active={mode === "apps"} onClick={() => setMode("apps")} icon={LayoutGrid}>
              Apps
            </ModeButton>
          </div>
        </div>

        {/* Right-side tabs (Agent mode only) */}
        <div className="flex items-center gap-1">
          {mode === "agent" && (
            <>
              <Link
                href="/generate"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-medium text-white bg-accent hover:bg-accent/90 mr-1"
                title="Let the engine generate a live MCP app from a prompt"
              >
                <Wand2 className="h-3.5 w-3.5" strokeWidth={2} />
                Generate app
              </Link>
              <TabButton active={tab === "processing"} onClick={() => setTab("processing")} icon={Brain}>
                Model Processing
              </TabButton>
              <TabButton active={tab === "usage"} onClick={() => setTab("usage")} icon={CreditCard}>
                Usage
              </TabButton>
            </>
          )}
          {mode === "apps" && (
            <span className="text-[11px] font-mono text-[var(--secondary)]">
              live read-only dashboards · channel-bound
            </span>
          )}
        </div>
      </header>

      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}

      {/* Apps mode: live read-only dashboards bound to real tools via channels */}
      {mode === "apps" && (
        <div className="flex-1 min-h-0">
          <AppsMode servers={state.catalogue.servers} providerKind={state.providerKind} />
        </div>
      )}

      {/* Agent mode: the goal/approval cockpit. Rails collapse so the activity +
          approval center can breathe — fixes the congestion. */}
      {mode === "agent" && (
      <div
        className="flex-1 grid min-h-0"
        style={{ gridTemplateColumns: railsOpen ? "260px 1fr" : "1fr" }}
      >
        {/* Left rail */}
        {railsOpen && (
        <aside className="border-r border-[var(--border)] overflow-y-auto p-2.5 space-y-3">
          <HistoryList runs={state.history} activeId={state.sessionId} onSelect={loadRun} />
          <ServerPanel
            catalogue={state.catalogue.servers}
            state={state.servers}
            onToggle={toggleServer}
          />
          <ToolInspector
            catalogue={state.catalogue.tools}
            state={state.tools}
            enabledServerIds={enabledServerIds}
            onPin={pinTool}
          />
        </aside>
        )}

        {/* Center: the Model Processing trace (or Usage) + the goal input */}
        <main className="flex flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto">
            {tab === "usage" ? (
              <UsageDashboard usage={state.usageStats} servers={state.catalogue.servers} />
            ) : (
              <ModelProcessing
                traces={state.traces}
                pending={state.pending}
                crafts={state.crafts}
                toolsById={toolsById}
                onResolve={resolveApproval}
              />
            )}
          </div>
          <div className="border-t border-[var(--border)] bg-[var(--surface)]/80 px-4 py-3 space-y-2">
            <div className="flex items-end gap-2">
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Give the agent a goal across your apps… e.g. resolve the issues assigned to me"
                rows={2}
                onKeyDown={(e) => {
                  // Enter sends; Shift+Enter inserts a newline.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit(goal);
                  }
                }}
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm leading-relaxed resize-none focus:outline-none focus:border-accent disabled:opacity-50"
                disabled={isRunning}
              />
              {isRunning ? (
                <button
                  onClick={() => stop()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--border)] hover:border-accent/40 text-sm"
                >
                  <Square className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Stop
                </button>
              ) : (
                <button
                  onClick={() => submit(goal)}
                  disabled={!goal.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-40 hover:bg-accent/90"
                >
                  <Play className="h-3.5 w-3.5" strokeWidth={2} />
                  Run
                </button>
              )}
            </div>
            <div className="flex items-center justify-end">
              <span className="text-[10px] font-mono text-[var(--secondary)]">
                Enter to send · Shift+Enter for newline · reads run automatically · writes ask approval
              </span>
            </div>
          </div>
        </main>
      </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-medium transition-colors ${
        active
          ? "bg-accent/10 text-accent border border-accent/30"
          : "text-[var(--secondary)] hover:text-[var(--foreground)] border border-transparent"
      }`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
      {children}
    </button>
  );
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors ${
        active ? "bg-accent text-white" : "text-[var(--secondary)] hover:text-[var(--foreground)]"
      }`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
      {children}
    </button>
  );
}

function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="max-w-lg w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold tracking-tight">What is McpDeck?</h2>
          <button onClick={onClose} className="text-[var(--secondary)] hover:text-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[13px] leading-relaxed text-[var(--secondary)]">
          An autonomous agent that <strong>orchestrates across your connected apps</strong> (GitHub,
          Notion, Linear, Slack) as one system — resolving ids in one app and acting in the next.
          <strong> Reads run automatically; it pauses for your approval before each write.</strong>
        </p>
        <ol className="text-[13px] space-y-2">
          <HelpLine n={1}>Type a goal (e.g. &ldquo;resolve the issues assigned to me&rdquo;) and press Run.</HelpLine>
          <HelpLine n={2}>
            Watch <strong>Model Processing</strong> — its reasoning and every tool it uses across apps,
            live. Reads run on their own.
          </HelpLine>
          <HelpLine n={3}>
            A <strong>write</strong> (create / update / comment / commit / PR) shows an approval card —
            edit the args, approve, or deny. The agent resumes the instant you decide.
          </HelpLine>
          <HelpLine n={4}>
            It can render a <strong>live editable panel</strong> for results, bound to the real tools
            (auto-refreshing, auto-saving).
          </HelpLine>
          <HelpLine n={5}>
            Check the <strong>Usage</strong> tab for live request counts, cost, and per-server data
            volume — like a subscription dashboard.
          </HelpLine>
          <HelpLine n={6}>
            From <strong>Replay</strong> (right rail) you can re-run any past call or branch a new
            investigation from it.
          </HelpLine>
        </ol>
        <p className="text-[11px] text-[var(--secondary)] leading-relaxed border-t border-[var(--border)] pt-3">
          With <code>MCPDECK_SERVERS</code> set, the servers are <strong>real</strong> (GitHub, Notion,
          Linear, Slack). Switch to <strong>Apps</strong> mode for live read-only dashboards bound to those
          servers through the shared channel poll loop — that&apos;s the bidirectional part.
        </p>
        <button
          onClick={onClose}
          className="w-full py-2 rounded bg-accent text-white text-sm font-medium hover:bg-accent/90"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

function HelpLine({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="shrink-0 h-5 w-5 rounded-full border border-accent/40 text-accent text-[10px] font-mono flex items-center justify-center">
        {n}
      </span>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}

function HistoryList({
  runs,
  activeId,
  onSelect,
}: {
  runs: RunSummary[];
  activeId: string | null;
  onSelect: (sessionId: string) => void;
}) {
  if (runs.length === 0) return null;
  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] font-mono text-[var(--secondary)] mb-2 px-1">
        <History className="h-3 w-3" strokeWidth={1.8} /> History
      </h3>
      <div className="space-y-0.5">
        {runs.map((r) => (
          <button
            key={r.sessionId}
            onClick={() => onSelect(r.sessionId)}
            title={r.goal}
            className={`w-full text-left rounded-md px-2 py-1.5 border transition-colors ${
              r.sessionId === activeId
                ? "border-accent/40 bg-accent/5"
                : "border-transparent hover:bg-[var(--surface-2)]"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDot(r.status)}`} />
              <span className="text-[12px] truncate">{r.goal}</span>
            </div>
            <div className="text-[9px] font-mono text-[var(--secondary)] pl-3 mt-0.5">
              {relTime(r.startedAt)}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function statusDot(status: string): string {
  if (status === "running" || status === "awaiting_input" || status === "starting") return "bg-amber-500";
  if (status === "error") return "bg-red-500";
  return "bg-emerald-500";
}

function relTime(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StatusPill({ status }: { status: ReturnType<typeof useMcpDeck>["state"]["status"] }) {
  const map: Record<typeof status, { label: string; cls: string }> = {
    idle: { label: "idle", cls: "border-[var(--border)] text-[var(--secondary)]" },
    starting: { label: "starting", cls: "border-amber-500/40 text-amber-700 dark:text-amber-400" },
    running: { label: "running", cls: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400" },
    awaiting_input: { label: "awaiting you", cls: "border-accent/40 text-accent" },
    completed: { label: "completed", cls: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400" },
    error: { label: "error", cls: "border-red-500/40 text-red-700 dark:text-red-400" },
  };
  const v = map[status];
  return (
    <span
      className={`text-[10px] uppercase tracking-[0.2em] font-mono px-2 py-0.5 rounded-full border ${v.cls}`}
    >
      {v.label}
    </span>
  );
}

function ProviderBadge({ kind }: { kind: "mock" | "real" | null }) {
  if (!kind) return null; // catalogue not loaded yet
  const real = kind === "real";
  return (
    <span
      className={`text-[10px] uppercase tracking-[0.2em] font-mono px-2 py-0.5 rounded-full border ${
        real
          ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
          : "border-[var(--border)] text-[var(--secondary)]"
      }`}
      title={
        real
          ? "Connected to real MCP servers over stdio (MCPDECK_SERVERS)."
          : "Built-in mock servers (git/linear). Set MCPDECK_SERVERS to connect real MCP servers."
      }
    >
      {real ? "live mcp" : "mock"}
    </span>
  );
}
