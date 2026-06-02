"use client";

import { useMemo, useState } from "react";
import { Sparkles, Square, Play, Activity, CreditCard, HelpCircle, X, Wand2, Bot, LayoutGrid, PanelsTopLeft } from "lucide-react";
import Link from "next/link";
import { useMcpDeck } from "@/lib/hooks/useMcpDeck";
import { ServerPanel } from "./ServerPanel";
import { ToolInspector } from "./ToolInspector";
import { ResourceBrowser } from "./ResourceBrowser";
import { ReplayTimeline } from "./ReplayTimeline";
import { ActivityStream } from "./ActivityStream";
import { UsageDashboard } from "./UsageDashboard";
import { AppsMode } from "./apps/AppsMode";
import { SAMPLE_GOALS } from "@/lib/mcpdeck/sample-goals";
import { useCraftAuthor } from "@/lib/hooks/useCraftAuthor";
import { CraftRenderer } from "@/components/crafts/CraftRenderer";

type Tab = "activity" | "usage";
type Mode = "agent" | "apps";

export function McpDeckPanel() {
  const {
    state,
    start,
    stop,
    resolveApproval,
    toggleServer,
    pinTool,
    expandResource,
    replay,
    branch,
  } = useMcpDeck();
  const [goal, setGoal] = useState("");
  const [tab, setTab] = useState<Tab>("activity");
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

  const [liveUI, setLiveUI] = useState(true);
  const { crafts, authoring, error: craftError, author, replace } = useCraftAuthor();

  const isRunning =
    state.status === "running" ||
    state.status === "awaiting_input" ||
    state.status === "starting";

  const submit = (text: string) => {
    if (!text.trim() || isRunning || authoring) return;
    if (liveUI) {
      // §1–5: the engine AUTHORS live UI for this request instead of plain text.
      void author(text.trim());
      setGoal(""); // clear the composer once submitted
    } else {
      void start(text.trim());
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--background)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-md px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/apps" className="text-[var(--secondary)] hover:text-accent text-[11px] font-mono">
            ← apps
          </Link>
          <span className="h-3.5 w-px bg-[var(--border)]" />
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
                href="/apps/mcpdeck/generate"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-medium text-white bg-accent hover:bg-accent/90 mr-1"
                title="Let the engine generate a live MCP app from a prompt"
              >
                <Wand2 className="h-3.5 w-3.5" strokeWidth={2} />
                Generate app
              </Link>
              <TabButton active={tab === "activity"} onClick={() => setTab("activity")} icon={Activity}>
                Activity
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
        style={{ gridTemplateColumns: railsOpen ? "260px 1fr 280px" : "1fr" }}
      >
        {/* Left rail */}
        {railsOpen && (
        <aside className="border-r border-[var(--border)] overflow-y-auto p-2.5 space-y-3">
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

        {/* Center: live crafts (Live UI) OR activity OR usage, + goal input */}
        <main className="flex flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto">
            {tab === "usage" ? (
              <UsageDashboard usage={state.usageStats} servers={state.catalogue.servers} />
            ) : liveUI && (crafts.length > 0 || authoring || craftError) ? (
              <div className="max-w-3xl mx-auto px-4 py-4 space-y-5">
                {crafts.map(({ block, prose, request }) => (
                  <div key={block.id} className="space-y-2">
                    {/* the user's request, chat-style */}
                    <div className="flex justify-end">
                      <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-accent/10 border border-accent/20 px-3.5 py-2 text-[13px] leading-snug">
                        {request}
                      </div>
                    </div>
                    {/* the engine's authored live UI */}
                    {prose && <p className="text-[13px] text-[var(--secondary)] leading-relaxed">{prose}</p>}
                    <CraftRenderer block={block} onEdited={replace} providerId="sonnet" />
                  </div>
                ))}
                {authoring && (
                  <div className="flex items-center gap-2 text-[13px] text-[var(--secondary)]">
                    <Sparkles className="h-4 w-4 text-accent animate-pulse" />
                    The engine is authoring a live UI…
                  </div>
                )}
                {craftError && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[12px] text-red-700 dark:text-red-300">
                    {craftError}
                  </div>
                )}
              </div>
            ) : (
              <ActivityStream
                activity={state.activity}
                pending={state.pending}
                toolsById={toolsById}
                onResolve={resolveApproval}
              />
            )}
          </div>
          <div className="border-t border-[var(--border)] bg-[var(--surface)]/80 px-4 py-3 space-y-2">
            {/* Sample prompts as compact chips — only while idle, so they never crowd a run. */}
            {!isRunning && state.activity.length === 0 && (
              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_GOALS.map((g) => (
                  <button
                    key={g.text}
                    onClick={() => {
                      setGoal(g.text);
                      submit(g.text);
                    }}
                    title={`Run · uses ${g.server}`}
                    className="inline-flex items-center gap-1.5 max-w-full px-2.5 py-1 rounded-full border border-[var(--border)] text-[12px] hover:border-accent/50 hover:bg-accent/5 transition-colors"
                  >
                    <Play className="h-2.5 w-2.5 text-accent shrink-0" strokeWidth={2.5} />
                    <span className="truncate">{firstClause(g.text)}</span>
                    <span className="font-mono text-[9px] text-[var(--secondary)] shrink-0">{g.server}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder={liveUI ? "Describe a live UI to build…" : "Give the agent a goal…"}
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    submit(goal);
                  }
                }}
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm leading-relaxed resize-none focus:outline-none focus:border-accent disabled:opacity-50"
                disabled={isRunning || authoring}
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
                  disabled={!goal.trim() || authoring}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-40 hover:bg-accent/90"
                >
                  <Play className="h-3.5 w-3.5" strokeWidth={2} />
                  {liveUI ? "Run" : "Run"}
                </button>
              )}
            </div>
            <div className="flex items-center justify-between">
              <button
                onClick={() => setLiveUI((v) => !v)}
                className={`inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-full border transition-colors ${
                  liveUI
                    ? "border-accent/40 text-accent bg-accent/5"
                    : "border-[var(--border)] text-[var(--secondary)]"
                }`}
                title="Live UI: the engine authors an interactive widget for your request instead of plain text."
              >
                <Sparkles className="h-3 w-3" />
                Live UI {liveUI ? "on" : "off"}
              </button>
              <span className="text-[10px] font-mono text-[var(--secondary)]">
                {liveUI
                  ? "⌘/Ctrl + Enter · engine authors a live widget bound to real tools"
                  : "⌘/Ctrl + Enter · agent loop, pauses for approval per tool call"}
              </span>
            </div>
          </div>
        </main>

        {/* Right rail */}
        {railsOpen && (
        <aside className="border-l border-[var(--border)] overflow-y-auto p-2.5 space-y-3">
          <ResourceBrowser nodes={state.resources} onExpand={expandResource} />
          <ReplayTimeline entries={state.replay} onReplay={replay} onBranch={branch} busy={isRunning} />
        </aside>
        )}
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

/** First sentence/clause of a sample goal, for a compact chip label. */
function firstClause(text: string): string {
  const cut = text.search(/[,.]|\band\b/);
  return cut > 12 ? text.slice(0, cut).trim() : text;
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
          A live cockpit for an AI agent that uses <strong>MCP tools</strong>. You give it a goal;
          it works toward it by calling tools — but <strong>pauses for your approval before every
          call</strong>. You can edit the arguments, approve, deny, or auto-approve a tool for the
          session.
        </p>
        <ol className="text-[13px] space-y-2">
          <HelpLine n={1}>Pick a sample goal (or type one) and press Start.</HelpLine>
          <HelpLine n={2}>
            Watch the <strong>Activity</strong> tab — the agent narrates, then a red approval card
            appears for each tool call.
          </HelpLine>
          <HelpLine n={3}>
            Approve / edit / deny. The agent resumes the instant you decide.
          </HelpLine>
          <HelpLine n={4}>
            Steer mid-run from the rails: toggle a <strong>server</strong> off, <strong>pin</strong>{" "}
            a tool, expand a <strong>resource</strong>.
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
          With <code>MCPDECK_SERVERS</code> set, the servers are <strong>real</strong> (fs, GitHub, Notion,
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
          : "Built-in mock servers (fs/git/linear). Set MCPDECK_SERVERS to connect real MCP servers."
      }
    >
      {real ? "live mcp" : "mock"}
    </span>
  );
}
