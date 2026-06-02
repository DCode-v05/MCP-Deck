"use client";

import Link from "next/link";
import { ArrowLeft, Radio, Zap } from "lucide-react";
import { useChannel } from "@/lib/hooks/useChannel";
import type { ChannelBinding } from "@/lib/channels/wire";

const METRIC: ChannelBinding[] = [{ channel: "mock.live_metric", as: "metric", poll_s: 2 }];
const FLEET: ChannelBinding[] = [{ channel: "mock.fleet", as: "fleet", poll_s: 2 }];

export function ChannelsDemo() {
  return (
    <div className="min-h-full bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-md px-6 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link href="/apps" className="text-[var(--secondary)] hover:text-accent text-[11px] font-mono inline-flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> apps
          </Link>
          <span className="h-3.5 w-px bg-[var(--border)]" />
          <Radio className="h-5 w-5 text-accent" strokeWidth={1.5} />
          <h1 className="font-display text-2xl font-bold tracking-tight">Channels</h1>
          <span className="hidden md:inline text-[10px] uppercase tracking-[0.25em] text-[var(--secondary)] font-mono">
            bidirectional engine · live fan-out
          </span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-2">
          <h2 className="font-display text-lg font-bold tracking-tight">One poll loop, fanned out</h2>
          <p className="text-[13px] leading-relaxed text-[var(--secondary)]">
            Both cards below are <strong>separate crafts</strong> subscribing to the <strong>same</strong>{" "}
            <code className="text-accent">mock.live_metric</code> channel. The server polls the asset{" "}
            <strong>once</strong> per tick and fans the result to every subscriber — so the two cards show the{" "}
            <strong>identical rev</strong>, updating in lockstep. That is the engine&apos;s core property: data flows
            down through a shared channel, with <strong>no engine reasoning per tick</strong>.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MetricCard label="Craft A · ops dashboard" />
          <MetricCard label="Craft B · SRE view (different thread)" />
        </div>

        <FleetCard />
      </div>
    </div>
  );
}

function MetricCard({ label }: { label: string }) {
  // Distinct craft_id/thread_id per card — yet they share ONE channel + poll loop.
  const { state } = useChannel(`thr_${slug(label)}`, `craft_${slug(label)}`, METRIC);
  const m = (state.data.metric ?? {}) as { p99_ms?: number; error_rate?: number };
  const rev = state.rev.metric ?? 0;
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="h-1 bg-accent" />
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{label}</span>
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${state.connected ? "border-emerald-500/40 text-emerald-600" : "border-[var(--border)] text-[var(--secondary)]"}`}>
            {state.connected ? "live" : "…"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Tile label="p99 latency" value={m.p99_ms != null ? `${m.p99_ms} ms` : "—"} bad={(m.p99_ms ?? 0) > 400} />
          <Tile label="error rate" value={m.error_rate != null ? `${m.error_rate}%` : "—"} bad={(m.error_rate ?? 0) > 2} />
        </div>
        <div className="text-[11px] font-mono text-[var(--secondary)] flex items-center gap-1.5">
          <Zap className="h-3 w-3" /> rev <b className="text-[var(--foreground)] tabular-nums">{rev}</b> · shared across all subscribers
        </div>
      </div>
    </div>
  );
}

function FleetCard() {
  const { state, request } = useChannel("thr_fleet", "craft_fleet", FLEET);
  const f = (state.data.fleet ?? {}) as { trucks?: Array<{ truck_id: string; status: string }>; stopped?: number; total?: number };
  const rev = state.rev.fleet ?? 0;
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="h-1" style={{ background: "#2E86C0" }} />
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Craft C · fleet board <span className="text-[var(--secondary)] font-normal">(route:direct action)</span></span>
          <span className="text-[11px] font-mono text-[var(--secondary)]">rev <b className="text-[var(--foreground)] tabular-nums">{rev}</b></span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(f.trucks ?? []).map((t) => (
            <span key={t.truck_id} className="text-[11px] font-mono px-2 py-0.5 rounded border" style={{ borderColor: t.status === "stopped" ? "#f0b4b4" : "#aadcbb", color: t.status === "stopped" ? "#b32424" : "#0a6e2e", background: t.status === "stopped" ? "#ffe9e9" : "#e7f6ec" }}>
              {t.truck_id}
            </span>
          ))}
          {!f.trucks && <span className="text-[12px] text-[var(--secondary)]">connecting…</span>}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-[var(--secondary)]">
            {f.stopped != null ? `${f.stopped}/${f.total} stopped` : ""}
          </span>
          <button
            onClick={() => request("mock.fleet", "ping", {})}
            className="text-[11px] px-3 py-1.5 rounded-lg text-white font-medium hover:opacity-90"
            style={{ background: "#2E86C0" }}
            title="route:direct — a mechanical asset call straight through the channel, no engine"
          >
            Ping asset (route:direct)
          </button>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
      <div className="text-[10px] uppercase tracking-[0.15em] font-mono text-[var(--secondary)]">{label}</div>
      <div className="font-mono text-lg tabular-nums" style={{ color: bad ? "#dc2626" : "#059669" }}>{value}</div>
    </div>
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
