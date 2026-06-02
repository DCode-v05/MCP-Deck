"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Minus, Plus, ShoppingCart, CreditCard, CheckCircle2, ArrowRight, Shield, X } from "lucide-react";
import { useTillpoint } from "@/lib/hooks/useTillpoint";
import { CATALOG } from "@/lib/apps/tillpoint/pricing";

export function TillpointApp() {
  const { cart, pendingCharge, charging, lastResult, setQty, setCoupon, setZip, checkout, resolveCharge } =
    useTillpoint();
  const [couponInput, setCouponInput] = useState("");
  const [zipInput, setZipInput] = useState("");

  // Debounce coupon + zip so each keystroke flows to the engine but not too fast.
  useEffect(() => {
    const t = setTimeout(() => setCoupon(couponInput), 280);
    return () => clearTimeout(t);
  }, [couponInput, setCoupon]);
  useEffect(() => {
    const t = setTimeout(() => setZip(zipInput), 280);
    return () => clearTimeout(t);
  }, [zipInput, setZip]);

  const qtyOf = (productId: string) => cart?.items.find((i) => i.productId === productId)?.qty ?? 0;

  const loadScenario = (s: {
    qtys: Record<string, number>;
    coupon: string;
    zip: string;
  }) => {
    for (const p of CATALOG) setQty(p.id, s.qtys[p.id] ?? 0);
    setCouponInput(s.coupon);
    setZipInput(s.zip);
  };
  const SCENARIOS: Array<{ label: string; qtys: Record<string, number>; coupon: string; zip: string }> = [
    { label: "Loaded cart · SAVE20 · CA", qtys: { tee: 2, hoodie: 3, cap: 1 }, coupon: "SAVE20", zip: "90001" },
    { label: "Free-ship combo · NY", qtys: { socks: 4, tee: 1 }, coupon: "FREESHIP", zip: "10001" },
  ];

  const accent = "#1F9D57";
  return (
    <div className="flex flex-col h-full bg-[var(--background)]">
      <div className="h-1" style={{ background: accent }} />
      <header className="border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-md px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/apps" className="text-[var(--secondary)] hover:text-[var(--foreground)] text-[11px] font-mono">
            ← apps
          </Link>
          <span className="h-4 w-px bg-[var(--border)]" />
          <span className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: `${accent}1A`, color: accent }}>
            <ShoppingCart className="h-5 w-5" strokeWidth={1.6} />
          </span>
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight leading-none">Tillpoint</h1>
            <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--secondary)] font-mono">
              Commerce · live checkout
            </span>
          </div>
        </div>
        <FlowLegend />
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-4">
          {/* How to use */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="text-[10px] uppercase tracking-[0.25em] font-mono text-[var(--secondary)] mb-2">
              How to use this app
            </div>
            <ol className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] leading-snug text-[var(--secondary)]">
              <li className="flex gap-2"><Dot c="bg-accent" />Change <strong>quantity, coupon, or ZIP</strong> — each edit streams to the engine.</li>
              <li className="flex gap-2"><Dot c="bg-emerald-500" />Totals, tax &amp; shipping <strong>recompute live</strong> on the right.</li>
              <li className="flex gap-2"><Dot c="bg-amber-500" /><strong>Place order</strong> → approve the charge in the popup.</li>
            </ol>
            <p className="mt-2 text-[10px] text-[var(--secondary)]">
              Try coupons <span className="font-mono">SAVE10</span>, <span className="font-mono">SAVE20</span>,
              <span className="font-mono"> FREESHIP</span> · ZIP 9xxxx=CA, 1xxxx=NY, 0xxxx=no tax.
            </p>
            <div className="mt-2 pt-2 border-t border-[var(--border)]">
              <div className="text-[9px] uppercase tracking-[0.2em] font-mono text-[var(--secondary)] mb-1.5">
                Sample scenarios — one click to load
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SCENARIOS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => loadScenario(s)}
                    className="text-[11px] px-2 py-1 rounded-full border transition-colors hover:opacity-90"
                    style={{ borderColor: `${accent}55`, color: accent, background: `${accent}10` }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-6">
          {/* Catalog + cart */}
          <div className="space-y-3">
            <h2 className="text-[10px] uppercase tracking-[0.25em] font-mono text-[var(--secondary)]">
              Cart — change quantities, totals recompute live
            </h2>
            {CATALOG.map((p) => {
              const qty = qtyOf(p.id);
              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between rounded-lg border p-3 ${
                    qty > 0 ? "border-[var(--border)] bg-[var(--surface)]" : "border-dashed border-[var(--border)] opacity-70"
                  }`}
                >
                  <div>
                    <div className="font-medium text-sm">{p.name}</div>
                    <div className="text-[12px] text-[var(--secondary)] font-mono">${p.unitPrice.toFixed(2)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setQty(p.id, qty - 1)}
                      disabled={qty === 0}
                      className="h-7 w-7 rounded border border-[var(--border)] flex items-center justify-center hover:border-accent/40 disabled:opacity-30"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-7 text-center font-mono text-sm tabular-nums">{qty}</span>
                    <button
                      onClick={() => setQty(p.id, qty + 1)}
                      className="h-7 w-7 rounded border border-[var(--border)] flex items-center justify-center hover:border-accent/40"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.2em] font-mono text-[var(--secondary)]">
                  Coupon
                </span>
                <input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  placeholder="SAVE10 · SAVE20 · FREESHIP"
                  className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm focus:outline-none focus:border-accent"
                />
                {cart?.coupon && cart.couponNote && (
                  <span
                    className={`text-[11px] mt-1 inline-block ${
                      cart.couponValid ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {cart.couponNote}
                  </span>
                )}
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.2em] font-mono text-[var(--secondary)]">
                  Ship to ZIP
                </span>
                <input
                  value={zipInput}
                  onChange={(e) => setZipInput(e.target.value)}
                  placeholder="e.g. 90001"
                  inputMode="numeric"
                  className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm focus:outline-none focus:border-accent"
                />
                {cart && cart.zip && (
                  <span className="text-[11px] mt-1 inline-block text-[var(--secondary)]">
                    tax region: {cart.taxRegion}
                  </span>
                )}
              </label>
            </div>
          </div>

          {/* Live totals */}
          <aside className="space-y-3">
            <h2 className="text-[10px] uppercase tracking-[0.25em] font-mono text-[var(--secondary)]">
              Totals
            </h2>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 space-y-2 text-sm">
              <Row label="Subtotal" value={cart?.totals.subtotal} />
              {cart && cart.totals.discount > 0 && (
                <Row label="Discount" value={-cart.totals.discount} accent />
              )}
              <Row label="Shipping" value={cart?.totals.shipping} freeIfZero />
              <Row label={`Tax${cart?.zip ? ` (${cart.taxRegion})` : ""}`} value={cart?.totals.tax} />
              <div className="h-px bg-[var(--border)] my-1" />
              <Row label="Total" value={cart?.totals.total} bold />

              {cart?.paid ? (
                <div className="mt-3 rounded border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-[12px] text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>Paid · order {cart.orderId}</span>
                </div>
              ) : (
                <button
                  onClick={() => checkout()}
                  disabled={!cart || cart.items.length === 0 || charging || !!pendingCharge}
                  className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-40 hover:opacity-90"
                  style={{ background: accent }}
                >
                  <CreditCard className="h-4 w-4" strokeWidth={1.75} />
                  {charging ? "Charging…" : "Place order"}
                </button>
              )}
              {lastResult && !lastResult.ok && (
                <div className="text-[11px] text-[var(--secondary)] mt-1">{lastResult.message}</div>
              )}
            </div>
            <p className="text-[11px] text-[var(--secondary)] leading-relaxed">
              Every quantity / coupon / ZIP change streams to the engine, which recomputes and pushes
              the totals straight back — no page reload, no new turn. Checkout pauses for your approval
              before the (mock) charge runs.
            </p>
          </aside>
          </div>
        </div>
      </div>

      {pendingCharge && (
        <ChargeApproval
          amount={pendingCharge.amount}
          currency={pendingCharge.currency}
          accent={accent}
          onApprove={() => resolveCharge(pendingCharge.chargeId, true)}
          onCancel={() => resolveCharge(pendingCharge.chargeId, false)}
        />
      )}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  accent,
  freeIfZero,
}: {
  label: string;
  value: number | undefined;
  bold?: boolean;
  accent?: boolean;
  freeIfZero?: boolean;
}) {
  const display =
    value === undefined
      ? "—"
      : freeIfZero && value === 0
        ? "Free"
        : `${value < 0 ? "−" : ""}$${Math.abs(value).toFixed(2)}`;
  return (
    <div className={`flex items-center justify-between ${bold ? "font-semibold text-base" : ""}`}>
      <span className={accent ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--secondary)]"}>
        {label}
      </span>
      <span
        className={`font-mono tabular-nums transition-colors ${
          accent ? "text-emerald-600 dark:text-emerald-400" : ""
        }`}
      >
        {display}
      </span>
    </div>
  );
}

function ChargeApproval({
  amount,
  currency,
  accent,
  onApprove,
  onCancel,
}: {
  amount: number;
  currency: string;
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
          <h3 className="font-medium">Confirm payment</h3>
          <button onClick={onCancel} className="ml-auto text-[var(--secondary)] hover:text-[var(--foreground)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[13px] text-[var(--secondary)] leading-relaxed">
          The engine is about to run a real-world side effect — a Stripe charge. It paused the loop
          for your approval.
        </p>
        <div className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 font-mono text-lg text-center">
          ${amount.toFixed(2)} {currency}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onApprove}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-white text-sm font-medium hover:opacity-90"
            style={{ background: accent }}
          >
            Pay now <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-2 rounded border border-[var(--border)] text-sm text-[var(--secondary)] hover:text-[var(--foreground)]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function Dot({ c }: { c: string }) {
  return <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${c}`} />;
}

function FlowLegend() {
  return (
    <div className="hidden lg:flex items-center gap-3 text-[10px] font-mono text-[var(--secondary)]">
      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent" /> UI→engine</span>
      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> engine→UI</span>
      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> engine→real world</span>
    </div>
  );
}
