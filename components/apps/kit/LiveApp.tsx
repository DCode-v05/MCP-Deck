"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shield, X, ArrowRight, Zap, AlertTriangle, ArrowLeft } from "lucide-react";
import { useLiveApp } from "@/lib/hooks/useLiveApp";
import { AppIcon } from "./AppIcon";
import type { AppDefView, AppField, FieldValue, Metric } from "@/lib/apps/kit/types";

export function LiveApp({ def }: { def: AppDefView }) {
  const { state, pending, running, result, setField, setFields, runAction, resolveAction } = useLiveApp(def.id);
  const accent = def.accent;
  const metrics = state?.metrics ?? [];
  const hero = metrics[0];
  const rest = metrics.slice(1);

  return (
    <div className="flex flex-col h-full bg-[var(--background)]">
      {/* Branded header band */}
      <div className="h-1" style={{ background: accent }} />
      <header className="border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-md px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/apps" className="text-[var(--secondary)] hover:text-[var(--foreground)] inline-flex items-center gap-1 text-[11px] font-mono">
              <ArrowLeft className="h-3.5 w-3.5" /> apps
            </Link>
            <span className="h-4 w-px bg-[var(--border)]" />
            <span
              className="h-9 w-9 rounded-lg flex items-center justify-center"
              style={{ background: `${accent}1A`, color: accent }}
            >
              <AppIcon name={def.icon} className="h-5 w-5" />
            </span>
            <div>
              <h1 className="font-display text-lg font-bold tracking-tight leading-none">{def.name}</h1>
              <span className="text-[10px] uppercase tracking-[0.2em] font-mono text-[var(--secondary)]">
                {def.category}
              </span>
            </div>
            {def.hasLive && (
              <span
                className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] font-mono px-2 py-0.5 rounded-full"
                style={{ background: `${accent}1A`, color: accent }}
              >
                <Zap className="h-3 w-3" /> live
              </span>
            )}
          </div>
          <FlowLegend accent={accent} />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">
          <p className="text-[13px] text-[var(--secondary)] leading-relaxed max-w-2xl">{def.tagline}</p>

          <HowToUse actionLabel={def.actionLabel} hasLive={def.hasLive} accent={accent} />

          {/* Hero metric */}
          {hero && (
            <div
              className="rounded-xl border p-5 flex items-end justify-between"
              style={{ background: `${accent}0D`, borderColor: `${accent}33` }}
            >
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] font-mono text-[var(--secondary)]">
                  {hero.label}
                </div>
                <div className="font-display text-4xl font-bold tracking-tight mt-1" style={{ color: toneColor(hero.tone, accent) }}>
                  {hero.value}
                </div>
              </div>
              {state?.note && (
                <div className="text-[12px] text-[var(--secondary)] max-w-[55%] text-right leading-snug">
                  {state.note}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-6">
            {/* Controls */}
            <div className="space-y-3">
              <SectionLabel dot={accent}>Controls · your input streams to the engine</SectionLabel>
              {def.samples.length > 0 && (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
                  <div className="text-[9px] uppercase tracking-[0.2em] font-mono text-[var(--secondary)] mb-1.5">
                    Sample scenarios — one click to load
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {def.samples.map((s) => (
                      <button
                        key={s.label}
                        onClick={() => setFields(s.values)}
                        className="text-[11px] px-2 py-1 rounded-full border transition-colors hover:opacity-90"
                        style={{ borderColor: `${accent}55`, color: accent, background: `${accent}10` }}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {def.fields.map((f) => (
                <FieldControl
                  key={f.key}
                  field={f}
                  accent={accent}
                  value={state?.values[f.key] ?? f.default}
                  onChange={(v) => setField(f.key, v)}
                />
              ))}
            </div>

            {/* Metrics + action */}
            <aside className="space-y-3">
              <SectionLabel dot="#10b981">Live metrics · engine pushes these back</SectionLabel>
              <div className="grid grid-cols-2 gap-2">
                {rest.map((mt) => (
                  <MetricTile key={mt.key} metric={mt} accent={accent} />
                ))}
              </div>

              {state?.trigger && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{state.trigger}</span>
                </div>
              )}

              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-mono text-amber-700 dark:text-amber-400">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  Real-world action · asks first
                </div>
                <button
                  onClick={() => runAction()}
                  disabled={running || !!pending}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-40 transition-opacity hover:opacity-90"
                  style={{ background: accent }}
                >
                  {running ? "Working…" : def.actionLabel}
                  {!running && <ArrowRight className="h-3.5 w-3.5" />}
                </button>
                {result && (
                  <div
                    className={`rounded border px-2.5 py-2 text-[11px] space-y-1 ${
                      result.ok
                        ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300"
                        : "border-red-500/40 bg-red-500/5 text-red-700 dark:text-red-300"
                    }`}
                  >
                    <div>{result.message}</div>
                    {result.artifactPath && (
                      <div className="font-mono text-[10px] opacity-80 break-all">
                        📄 app-output/{result.artifactPath}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>

      {pending && (
        <ActionApproval
          pending={pending}
          actionLabel={def.actionLabel}
          accent={accent}
          onApprove={() => resolveAction(pending.actionId, true)}
          onCancel={() => resolveAction(pending.actionId, false)}
        />
      )}
    </div>
  );
}

function toneColor(tone: Metric["tone"], accent: string): string {
  if (tone === "good") return "#059669";
  if (tone === "warn") return "#b45309";
  if (tone === "bad") return "#dc2626";
  return accent;
}

function SectionLabel({ dot, children }: { dot: string; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] font-mono text-[var(--secondary)]">
      <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
      {children}
    </h2>
  );
}

function HowToUse({ actionLabel, hasLive, accent }: { actionLabel: string; hasLive: boolean; accent: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="text-[10px] uppercase tracking-[0.25em] font-mono text-[var(--secondary)] mb-2">
        How to use this app
      </div>
      <ol className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Step n={1} dot={accent}>
          Adjust the <strong>controls</strong> on the left — every change streams to the engine.
        </Step>
        <Step n={2} dot="#10b981">
          Watch the <strong>metrics</strong> recompute live{hasLive ? " (this one also streams on its own)" : ""}.
        </Step>
        <Step n={3} dot="#f59e0b">
          Press <strong>{actionLabel}</strong> → approve the real-world action in the popup.
        </Step>
      </ol>
    </div>
  );
}

function Step({ n, dot, children }: { n: number; dot: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="shrink-0 relative">
        <span className="h-5 w-5 rounded-full border border-[var(--border)] text-[10px] font-mono flex items-center justify-center">
          {n}
        </span>
        <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full" style={{ background: dot }} />
      </span>
      <span className="text-[11px] leading-snug text-[var(--secondary)]">{children}</span>
    </li>
  );
}

function FieldControl({
  field,
  value,
  accent,
  onChange,
}: {
  field: AppField;
  value: FieldValue;
  accent: string;
  onChange: (v: FieldValue) => void;
}) {
  const [local, setLocal] = useState<FieldValue>(value);
  useEffect(() => {
    setLocal(value);
  }, [value]);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{field.label}</span>
        {field.kind === "slider" && (
          <span className="font-mono text-[12px] tabular-nums" style={{ color: accent }}>
            {field.unit === "$" ? "$" : ""}
            {String(local)}
            {field.unit && field.unit !== "$" ? ` ${field.unit}` : ""}
          </span>
        )}
      </div>
      {field.kind === "slider" && (
        <input
          type="range"
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          value={Number(local)}
          onChange={(e) => {
            const v = Number(e.target.value);
            setLocal(v);
            onChange(v);
          }}
          className="w-full"
          style={{ accentColor: accent }}
        />
      )}
      {field.kind === "stepper" && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onChange(Math.max(field.min ?? 0, Number(local) - (field.step ?? 1)))}
            className="h-7 w-7 rounded border border-[var(--border)] hover:bg-[var(--surface-2)]"
          >
            −
          </button>
          <span className="w-12 text-center font-mono text-sm tabular-nums">{String(local)}</span>
          <button
            onClick={() => onChange(Math.min(field.max ?? 999, Number(local) + (field.step ?? 1)))}
            className="h-7 w-7 rounded border border-[var(--border)] hover:bg-[var(--surface-2)]"
          >
            +
          </button>
          {field.unit && <span className="text-[11px] text-[var(--secondary)]">{field.unit}</span>}
        </div>
      )}
      {field.kind === "toggle" && (
        <button
          onClick={() => onChange(!local)}
          className="text-[11px] uppercase tracking-[0.2em] font-mono px-3 py-1 rounded-full border transition-colors"
          style={
            local
              ? { borderColor: accent, color: accent, background: `${accent}14` }
              : { borderColor: "var(--border)", color: "var(--secondary)" }
          }
        >
          {local ? "ON" : "OFF"}
        </button>
      )}
      {field.kind === "text" && (
        <input
          type="text"
          value={String(local)}
          placeholder={field.placeholder}
          onChange={(e) => {
            setLocal(e.target.value);
            onChange(e.target.value);
          }}
          className="w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm focus:outline-none"
          style={{ outlineColor: accent }}
        />
      )}
      {field.kind === "select" && (
        <select
          value={String(local)}
          onChange={(e) => {
            setLocal(e.target.value);
            onChange(e.target.value);
          }}
          className="w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm focus:outline-none"
        >
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}
      {field.help && <p className="text-[10px] text-[var(--secondary)]">{field.help}</p>}
    </div>
  );
}

function MetricTile({ metric, accent }: { metric: Metric; accent: string }) {
  const color = toneColor(metric.tone, accent);
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 space-y-1.5">
      <div className="text-[10px] uppercase tracking-[0.15em] font-mono text-[var(--secondary)] truncate">
        {metric.label}
      </div>
      <div className="font-mono text-base tabular-nums transition-colors" style={{ color }}>
        {metric.value}
      </div>
      {typeof metric.bar === "number" && (
        <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
          <div
            className="h-full transition-all duration-300"
            style={{ width: `${Math.max(0, Math.min(100, metric.bar))}%`, background: color }}
          />
        </div>
      )}
    </div>
  );
}

function ActionApproval({
  pending,
  actionLabel,
  accent,
  onApprove,
  onCancel,
}: {
  pending: { title: string; body: string };
  actionLabel: string;
  accent: string;
  onApprove: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={onCancel}>
      <div
        className="max-w-sm w-full rounded-xl border-2 bg-[var(--surface)] p-5 space-y-3 shadow-xl"
        style={{ borderColor: `${accent}66` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5" strokeWidth={1.5} style={{ color: accent }} />
          <h3 className="font-medium">{pending.title}</h3>
          <button onClick={onCancel} className="ml-auto text-[var(--secondary)] hover:text-[var(--foreground)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[13px] text-[var(--secondary)] leading-relaxed">
          The engine paused the loop for your approval before this real-world side effect:
        </p>
        <div className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[13px]">
          {pending.body}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onApprove}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-white text-sm font-medium hover:opacity-90"
            style={{ background: accent }}
          >
            {actionLabel} <ArrowRight className="h-3.5 w-3.5" />
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

function FlowLegend({ accent }: { accent: string }) {
  return (
    <div className="hidden lg:flex items-center gap-3 text-[10px] font-mono text-[var(--secondary)]">
      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: accent }} /> UI→engine</span>
      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> engine→UI</span>
      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> real world</span>
    </div>
  );
}
