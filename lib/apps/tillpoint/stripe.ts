// Real Stripe charge for Tillpoint — TEST MODE ONLY.
// Direct REST calls (no SDK dependency). Gated hard on a test key so this can
// never move real money.

export interface StripeChargeResult {
  attempted: boolean; // false when no test key is configured (fell back to receipt-only)
  ok: boolean;
  paymentIntentId: string | null;
  status: string | null; // e.g. "succeeded"
  error: string | null;
  lividRefused?: boolean; // true if a live key was supplied and we refused it
}

/**
 * Charge via a real Stripe test-mode PaymentIntent.
 * - No STRIPE_SECRET_KEY            → { attempted:false } (caller falls back).
 * - Key present but not `sk_test_`  → REFUSED (never touches a live key).
 * - `sk_test_…`                     → real test PaymentIntent, confirmed.
 */
export async function chargeStripeTest(
  amountUsd: number,
  currency: string,
): Promise<StripeChargeResult> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    return { attempted: false, ok: false, paymentIntentId: null, status: null, error: null };
  }
  if (!key.startsWith("sk_test_")) {
    // Refuse live (sk_live_) or malformed keys — safety first.
    return {
      attempted: true,
      ok: false,
      paymentIntentId: null,
      status: null,
      error: "STRIPE_SECRET_KEY is not a test key (must start with sk_test_). Refusing to charge.",
      lividRefused: true,
    };
  }

  const cents = Math.round(amountUsd * 100);
  if (cents <= 0) {
    return { attempted: true, ok: false, paymentIntentId: null, status: null, error: "Amount must be > 0." };
  }

  // Form-encoded body — Stripe's API is application/x-www-form-urlencoded.
  const form = new URLSearchParams();
  form.set("amount", String(cents));
  form.set("currency", (currency || "usd").toLowerCase());
  form.set("payment_method", "pm_card_visa"); // Stripe's built-in test card
  form.set("payment_method_types[]", "card");
  form.set("confirm", "true");
  form.set("description", "Tillpoint test order");

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const data = (await res.json()) as {
      id?: string;
      status?: string;
      error?: { message?: string };
    };
    if (!res.ok || data.error) {
      return {
        attempted: true,
        ok: false,
        paymentIntentId: data.id ?? null,
        status: data.status ?? null,
        error: data.error?.message ?? `Stripe returned ${res.status}`,
      };
    }
    const ok = data.status === "succeeded";
    return {
      attempted: true,
      ok,
      paymentIntentId: data.id ?? null,
      status: data.status ?? null,
      error: ok ? null : `PaymentIntent status: ${data.status ?? "unknown"}`,
    };
  } catch (err) {
    return {
      attempted: true,
      ok: false,
      paymentIntentId: null,
      status: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
