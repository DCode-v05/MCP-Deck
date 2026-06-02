"use client";

import Link from "next/link";
import { Sparkles, ArrowRight, Wand2, Radio } from "lucide-react";
import { APP_META } from "@/lib/apps/kit/registry";
import { AppIcon } from "@/components/apps/kit/AppIcon";

interface AppCard {
  n: number;
  id: string;
  name: string;
  href: string;
  uiToEngine: string;
  engineToUi: string;
  sideEffect: string;
}

const APPS: AppCard[] = [
  { n: 1, id: "mcpdeck", name: "McpDeck", href: "/apps/mcpdeck", uiToEngine: "Edit tool args, toggle servers, pin tools", engineToUi: "Approval cards, tool-call timeline, server health", sideEffect: "Tool invocation (real MCP capable)" },
  { n: 2, id: "tillpoint", name: "Tillpoint", href: "/apps/tillpoint", uiToEngine: "Qty steppers, coupon, ZIP", engineToUi: "Totals + tax + shipping recompute live", sideEffect: "Approval-gated (mock) Stripe charge" },
  { n: 3, id: "verifly", name: "Verifly", href: "/apps/verifly", uiToEngine: "KYC fields", engineToUi: "Inline validation + readiness score", sideEffect: "Identity-provider verdict" },
  { n: 4, id: "standup", name: "Standup", href: "/apps/standup", uiToEngine: "Column loads + WIP limit", engineToUi: "Live reprioritisation + flow health", sideEffect: "Spawns sub-agent" },
  { n: 5, id: "gridmind", name: "Gridmind", href: "/apps/gridmind", uiToEngine: "Edit model cells", engineToUi: "Derived margins recompute", sideEffect: "Writes to Sheets" },
  { n: 6, id: "pilotview", name: "Pilotview", href: "/apps/pilotview", uiToEngine: "URL + next action", engineToUi: "Plan preview + reachability", sideEffect: "Drives Playwright" },
  { n: 7, id: "hunkmate", name: "Hunkmate", href: "/apps/hunkmate", uiToEngine: "Accept / reject hunks", engineToUi: "Mergeability recompute", sideEffect: "Commit + push" },
  { n: 8, id: "roamline", name: "Roamline", href: "/apps/roamline", uiToEngine: "Days / budget / vibe", engineToUi: "POIs + cost refetch", sideEffect: "Books flights / hotels" },
  { n: 9, id: "draftloop", name: "Draftloop", href: "/apps/draftloop", uiToEngine: "Tone / length / seed", engineToUi: "Word count + structure", sideEffect: "Export to Notion" },
  { n: 10, id: "whenly", name: "Whenly", href: "/apps/whenly", uiToEngine: "Duration / attendees / window", engineToUi: "Slots + conflicts re-poll", sideEffect: "Sends calendar invite" },
  { n: 11, id: "riskpad", name: "Riskpad", href: "/apps/riskpad", uiToEngine: "Size / leverage / stop sliders", engineToUi: "Risk + max-loss recompute", sideEffect: "Submits order" },
  { n: 12, id: "tunestream", name: "Tunestream", href: "/apps/tunestream", uiToEngine: "Energy / length / genre", engineToUi: "Track count + mood", sideEffect: "Saves to Spotify" },
  { n: 13, id: "stagecraft", name: "Stagecraft", href: "/apps/stagecraft", uiToEngine: "Layers / quality", engineToUi: "Render time + size", sideEffect: "Exports render" },
  { n: 14, id: "stepwise", name: "Stepwise", href: "/apps/stepwise", uiToEngine: "Onboarding answers", engineToUi: "Steps add / remove", sideEffect: "Provisions accounts" },
  { n: 15, id: "labelloop", name: "Labelloop", href: "/apps/labelloop", uiToEngine: "Correct predictions", engineToUi: "Accuracy recompute", sideEffect: "Writes to training set" },
  { n: 16, id: "echoscript", name: "Echoscript", href: "/apps/echoscript", uiToEngine: "Edit transcript", engineToUi: "Intent + entities rewrite", sideEffect: "Triggers implied action" },
  { n: 17, id: "pulsedash", name: "Pulsedash", href: "/apps/pulsedash", uiToEngine: "Drag thresholds (live stream)", engineToUi: "Breach status reruns", sideEffect: "Pages oncall" },
  { n: 18, id: "inboxpilot", name: "Inboxpilot", href: "/apps/inboxpilot", uiToEngine: "Select count + tone", engineToUi: "Drafts ready recompute", sideEffect: "Sends with edits" },
  { n: 19, id: "castlist", name: "Castlist", href: "/apps/castlist", uiToEngine: "Advance stages + bar", engineToUi: "Shortlist refits", sideEffect: "Sends scheduling links" },
  { n: 20, id: "brewbench", name: "Brewbench", href: "/apps/brewbench", uiToEngine: "Temp / tokens / dataset", engineToUi: "Accuracy + cost rerun", sideEffect: "Promotes to prod" },
];

const CATEGORY_ORDER = [
  "Dev & Infra",
  "Commerce",
  "Finance",
  "Productivity",
  "Data & ML",
  "Ops",
  "Automation",
  "Creative",
  "Travel",
  "Identity",
  "Onboarding",
  "Voice",
  "HR",
];

export function AppsGallery() {
  const byCategory = new Map<string, AppCard[]>();
  for (const a of APPS) {
    const cat = APP_META[a.id]?.category ?? "Apps";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(a);
  }
  const categories = [...byCategory.keys()].sort(
    (a, b) => (CATEGORY_ORDER.indexOf(a) + 1 || 99) - (CATEGORY_ORDER.indexOf(b) + 1 || 99),
  );

  return (
    <div className="min-h-full bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-md px-6 py-4 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-accent" strokeWidth={1.5} />
            <h1 className="font-display text-2xl font-bold tracking-tight">Connectors</h1>
            <span className="hidden md:inline text-[10px] uppercase tracking-[0.25em] text-[var(--secondary)] font-mono">
              Bidirectional UI apps
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/channels"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-[12px] font-medium hover:border-accent hover:text-accent"
              title="Live channel fan-out — the bidirectional engine core"
            >
              <Radio className="h-3.5 w-3.5" strokeWidth={2} />
              Channels
            </Link>
            <Link
              href="/apps/mcpdeck/generate"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-[12px] font-medium hover:bg-accent/90"
              title="Let the engine generate a live MCP app from a prompt"
            >
              <Wand2 className="h-3.5 w-3.5" strokeWidth={2} />
              Generate an app
            </Link>
            <span className="text-[11px] font-mono text-[var(--secondary)]">{APPS.length} apps</span>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* How it works */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
          <h2 className="font-display text-lg font-bold tracking-tight">How these connectors work</h2>
          <p className="text-[13px] leading-relaxed text-[var(--secondary)]">
            Each connector is a <strong>live app</strong> wired to a running engine loop — like a Claude
            connector that lives inside the chat. As you use one, data moves both ways in real time,
            colour-coded the same way everywhere:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FlowExplainer color="#EC3B4A" title="UI → engine" body="Move a slider, flip a toggle, type a field — each change streams into the loop instantly." />
            <FlowExplainer color="#10b981" title="engine → UI" body="The loop recomputes metrics and pushes them straight back into the panel — no reload." />
            <FlowExplainer color="#f59e0b" title="engine → real world" body="The main action pauses for your approval, then runs the side effect." />
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-[12px] leading-relaxed text-[var(--secondary)]">
            <span className="font-medium text-[var(--foreground)]">To try one:</span> open a connector →
            adjust the controls → watch the metrics update live → press the action and approve it.
          </div>
        </div>

        {categories.map((cat) => (
          <section key={cat}>
            <h2 className="text-[10px] uppercase tracking-[0.25em] font-mono text-[var(--secondary)] mb-3">
              {cat}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {byCategory.get(cat)!.map((a) => (
                <ConnectorCard key={a.id} app={a} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function FlowExplainer({ color, title, body }: { color: string; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        <span className="font-mono text-[11px] uppercase tracking-[0.15em]">{title}</span>
      </div>
      <p className="text-[11px] leading-snug text-[var(--secondary)]">{body}</p>
    </div>
  );
}

function ConnectorCard({ app }: { app: AppCard }) {
  const meta = APP_META[app.id];
  const accent = meta?.accent ?? "#EC3B4A";
  return (
    <Link href={app.href} className="group block h-full">
      <div
        className="h-full rounded-xl border bg-[var(--surface)] overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="h-1" style={{ background: accent }} />
        <div className="p-4">
          <div className="flex items-center gap-3">
            <span
              className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: `${accent}1A`, color: accent }}
            >
              <AppIcon name={meta?.icon ?? "sparkles"} className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold truncate">{app.name}</span>
                <ArrowRight className="h-3.5 w-3.5 text-[var(--secondary)] opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
              </div>
              <div className="text-[11px] text-[var(--secondary)] truncate">{meta?.blurb}</div>
            </div>
          </div>
          <dl className="mt-3 space-y-1 text-[11px] leading-snug border-t border-[var(--border)] pt-3">
            <FlowRow color={accent} label="in" text={app.uiToEngine} />
            <FlowRow color="#10b981" label="out" text={app.engineToUi} />
            <FlowRow color="#f59e0b" label="act" text={app.sideEffect} />
          </dl>
        </div>
      </div>
    </Link>
  );
}

function FlowRow({ color, label, text }: { color: string; label: string; text: string }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="mt-1 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-[var(--secondary)]">
        <span className="font-mono uppercase tracking-[0.15em] text-[9px] mr-1">{label}</span>
        {text}
      </span>
    </div>
  );
}
