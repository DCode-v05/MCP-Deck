"use client";

import { Activity, Coins, Server, Gauge, CheckCircle2, Clock } from "lucide-react";
import type { McpServerInfo, UsageStats } from "@/lib/mcpdeck/types";

interface Props {
  usage: UsageStats | null;
  servers: McpServerInfo[];
}

export function UsageDashboard({ usage, servers }: Props) {
  if (!usage) {
    return (
      <div className="h-full flex items-center justify-center text-[13px] text-[var(--secondary)] italic">
        No usage yet — start a run to see live consumption.
      </div>
    );
  }

  const serverName = (id: string) => servers.find((s) => s.id === id)?.name ?? id;
  const totalRequests = usage.byServer.reduce((a, s) => a + s.requests, 0);
  const quotaPct = Math.min(100, (totalRequests / usage.requestQuota) * 100);
  const totalBytes = usage.byServer.reduce((a, s) => a + s.bytes, 0);
  const durationMs = usage.updatedAt - usage.startedAt;

  return (
    <div className="h-full overflow-y-auto px-6 py-5 space-y-5 max-w-3xl mx-auto">
      {/* Plan header */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] font-mono text-[var(--secondary)]">
              Subscription
            </div>
            <div className="font-display text-xl font-bold tracking-tight mt-0.5">
              {usage.plan}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.25em] font-mono text-[var(--secondary)]">
              MCP requests
            </div>
            <div className="font-mono text-lg">
              {totalRequests}
              <span className="text-[var(--secondary)] text-sm"> / {usage.requestQuota}</span>
            </div>
          </div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              quotaPct > 90 ? "bg-red-500" : quotaPct > 70 ? "bg-amber-500" : "bg-accent"
            }`}
            style={{ width: `${quotaPct}%` }}
          />
        </div>
        <div className="mt-1.5 text-[11px] text-[var(--secondary)]">
          {usage.requestQuota - totalRequests} requests remaining this session
        </div>
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Coins} label="Reasoning cost" value={`$${usage.totalCost.toFixed(4)}`} sub={`${fmt(usage.inputTokens)}↓ ${fmt(usage.outputTokens)}↑ tok`} />
        <StatCard icon={Activity} label="Tool calls" value={`${usage.toolInvocations}`} sub={`${usage.iterations} engine iterations`} />
        <StatCard icon={CheckCircle2} label="Approved" value={`${usage.approvals}`} sub={`${usage.denials} denied`} />
        <StatCard icon={Gauge} label="Data pulled" value={fmtBytes(totalBytes)} sub={fmtDuration(durationMs)} />
      </div>

      {/* Per-server breakdown */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.25em] font-mono text-[var(--secondary)] mb-2 flex items-center gap-1.5">
          <Server className="h-3 w-3" /> Per-server usage
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
          {usage.byServer.map((s) => {
            const share = totalRequests > 0 ? (s.requests / totalRequests) * 100 : 0;
            return (
              <div key={s.serverId} className="p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{serverName(s.serverId)}</span>
                  <span className="font-mono text-[12px] text-[var(--secondary)]">
                    {s.requests} req · {fmtBytes(s.bytes)}
                    {s.errors > 0 && (
                      <span className="text-red-600 dark:text-red-400"> · {s.errors} err</span>
                    )}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                  <div className="h-full bg-accent/70" style={{ width: `${share}%` }} />
                </div>
                <div className="mt-1 flex items-center gap-1 text-[10px] font-mono text-[var(--secondary)]">
                  <Clock className="h-2.5 w-2.5" />
                  {s.lastActivityAt ? `last ${timeAgo(s.lastActivityAt)}` : "no activity"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-[var(--secondary)] leading-relaxed">
        These numbers update live as the loop runs — every approved tool call increments its
        server&apos;s request count and data volume, and engine reasoning rolls into cost. In a
        real deployment this is exactly where a per-asset rate-limit or billing quota would live.
      </p>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-mono text-[var(--secondary)]">
        <Icon className="h-3 w-3" strokeWidth={1.5} />
        {label}
      </div>
      <div className="font-mono text-lg mt-1">{value}</div>
      <div className="text-[10px] text-[var(--secondary)] font-mono mt-0.5">{sub}</div>
    </div>
  );
}

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}
function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s active`;
  return `${Math.floor(s / 60)}m ${s % 60}s active`;
}
function timeAgo(ts: number): string {
  const dt = Math.floor((Date.now() - ts) / 1000);
  if (dt < 5) return "just now";
  if (dt < 60) return `${dt}s ago`;
  if (dt < 3600) return `${Math.floor(dt / 60)}m ago`;
  return `${Math.floor(dt / 3600)}h ago`;
}
