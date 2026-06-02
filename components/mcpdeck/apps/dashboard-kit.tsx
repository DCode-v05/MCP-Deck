"use client";

import {
  GitPullRequest,
  TrendingUp,
  PenLine,
  Mail,
  Table2,
  Sparkles,
  Zap,
  AlertTriangle,
  Settings2,
  type LucideIcon,
} from "lucide-react";

export function DashboardIcon({ name, className }: { name: string; className?: string }) {
  const map: Record<string, LucideIcon> = {
    git: GitPullRequest,
    trending: TrendingUp,
    pen: PenLine,
    mail: Mail,
    table: Table2,
  };
  const Icon = map[name] ?? Sparkles;
  return <Icon className={className ?? "h-4 w-4"} />;
}

/** A small "live · rev N" pulse — proves the shared poll loop is ticking. */
export function LiveBadge({ connected, rev }: { connected: boolean; rev: number }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border ${
        connected
          ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
          : "border-[var(--border)] text-[var(--secondary)]"
      }`}
      title="Live data through the shared channel poll loop (no engine reasoning per tick)"
    >
      <Zap className="h-3 w-3" strokeWidth={2} />
      {connected ? `live · rev ${rev}` : "connecting…"}
    </span>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] uppercase tracking-[0.25em] font-mono text-[var(--secondary)] mb-2">
      {children}
    </h3>
  );
}

/** Connected-but-empty: NOT an error — a setup step with exact instructions. */
export function EmptyState({
  title,
  body,
  steps,
  footer,
}: {
  title: string;
  body: string;
  steps?: string[];
  footer?: string;
}) {
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Settings2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <h4 className="font-medium text-[14px]">{title}</h4>
      </div>
      <p className="text-[13px] leading-relaxed text-[var(--secondary)]">{body}</p>
      {steps && steps.length > 0 && (
        <ol className="space-y-1.5">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-2 text-[12px] leading-snug">
              <span className="shrink-0 h-4 w-4 rounded-full border border-amber-500/40 text-amber-700 dark:text-amber-400 text-[9px] font-mono flex items-center justify-center">
                {i + 1}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      )}
      {footer && (
        <p className="text-[10px] font-mono text-[var(--secondary)] border-t border-amber-500/20 pt-2">
          {footer}
        </p>
      )}
    </div>
  );
}

/** Not connected — credential missing, server skipped at startup. */
export function NotConnected({ label, credHint }: { label: string; credHint?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-5 space-y-2 text-center">
      <p className="text-[14px] font-medium">{label} is not connected</p>
      <p className="text-[12px] text-[var(--secondary)]">
        {credHint ? (
          <>
            Set <code className="text-accent">{credHint}</code> in <code>.env</code>, then restart{" "}
            <code>npm run dev</code>.
          </>
        ) : (
          "This server didn't connect at startup."
        )}
      </p>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 flex items-start gap-2">
      <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
      <div>
        <div className="text-[13px] font-medium text-red-700 dark:text-red-300">Channel error</div>
        <div className="text-[12px] text-[var(--secondary)] font-mono break-all">{message}</div>
        <div className="text-[10px] text-[var(--secondary)] mt-1">The shared loop keeps polling — transient blips self-heal.</div>
      </div>
    </div>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] animate-pulse" />
      ))}
    </div>
  );
}

export function Card({ children, onClick, accent }: { children: React.ReactNode; onClick?: () => void; accent?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="text-left w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 transition-colors enabled:hover:border-accent/50 enabled:hover:bg-accent/5 disabled:cursor-default"
      style={accent ? { borderLeftColor: accent, borderLeftWidth: 3 } : undefined}
    >
      {children}
    </button>
  );
}

export function relTime(iso: string | number | undefined): string {
  if (iso == null) return "";
  const t = typeof iso === "number" ? iso : Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const dt = Math.floor((Date.now() - t) / 1000);
  if (dt < 60) return "just now";
  if (dt < 3600) return `${Math.floor(dt / 60)}m ago`;
  if (dt < 86400) return `${Math.floor(dt / 3600)}h ago`;
  return `${Math.floor(dt / 86400)}d ago`;
}
