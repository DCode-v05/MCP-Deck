import type { CartState, PendingCharge, TillpointEvent } from "./types";
import { freshCart, recompute, CATALOG } from "./pricing";
import { writeArtifact } from "../kit/mcp-fs";
import { chargeStripeTest } from "./stripe";

const SESSION_KEY = Symbol.for("tillpoint.sessions");
type GlobalWithSessions = typeof globalThis & {
  [SESSION_KEY]?: Map<string, TillpointSession>;
};
const g = globalThis as GlobalWithSessions;
const SESSIONS: Map<string, TillpointSession> =
  g[SESSION_KEY] ?? (g[SESSION_KEY] = new Map());

export function createTillpoint(): TillpointSession {
  const id = `till-${Math.random().toString(36).slice(2, 10)}`;
  const s = new TillpointSession(id);
  SESSIONS.set(id, s);
  return s;
}
export function getTillpoint(id: string): TillpointSession | undefined {
  return SESSIONS.get(id);
}

type Subscriber = (ev: TillpointEvent) => void;

export class TillpointSession {
  readonly sessionId: string;
  private cart: CartState = freshCart();
  private subscribers = new Set<Subscriber>();
  private buffer: TillpointEvent[] = [];
  private pendingCharge: PendingCharge | null = null;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  subscribe(cb: Subscriber): () => void {
    this.subscribers.add(cb);
    for (const ev of this.buffer) cb(ev);
    return () => this.subscribers.delete(cb);
  }

  private emit(ev: TillpointEvent) {
    this.buffer.push(ev);
    if (this.buffer.length > 200) this.buffer.splice(0, this.buffer.length - 200);
    for (const s of this.subscribers) {
      try {
        s(ev);
      } catch {
        /* ignore */
      }
    }
  }

  emitSnapshot() {
    this.emit({ type: "session_ready", sessionId: this.sessionId });
    this.emit({ type: "cart_state", cart: this.cart });
    if (this.pendingCharge) this.emit({ type: "charge_pending", pending: this.pendingCharge });
  }

  // --- recompute + server-push (engine → UI, no new turn) ---
  private reshape() {
    const r = recompute(this.cart.items, this.cart.coupon, this.cart.zip);
    this.cart = {
      ...this.cart,
      totals: r.totals,
      couponValid: r.couponValid,
      couponNote: r.couponNote,
      taxRegion: r.taxRegion,
    };
    this.emit({ type: "cart_state", cart: this.cart });
  }

  // --- UI → engine actions ---
  setQty(productId: string, qty: number) {
    const clamped = Math.max(0, Math.min(99, Math.round(qty)));
    const existing = this.cart.items.find((i) => i.productId === productId);
    if (existing) {
      if (clamped === 0) {
        this.cart.items = this.cart.items.filter((i) => i.productId !== productId);
      } else {
        existing.qty = clamped;
      }
    } else if (clamped > 0) {
      const product = CATALOG.find((p) => p.id === productId);
      if (product) {
        this.cart.items.push({
          productId: product.id,
          name: product.name,
          unitPrice: product.unitPrice,
          qty: clamped,
        });
      }
    }
    // A real purchase resets the paid flag once the cart changes again.
    this.cart.paid = false;
    this.cart.orderId = null;
    this.reshape();
  }

  setCoupon(code: string) {
    this.cart.coupon = code.trim() === "" ? null : code.trim();
    this.reshape();
  }

  setZip(zip: string) {
    this.cart.zip = zip.replace(/[^0-9]/g, "").slice(0, 5);
    this.reshape();
  }

  // --- engine → real world: approval-gated charge ---
  checkout(): boolean {
    if (this.cart.items.length === 0 || this.cart.totals.total <= 0) return false;
    if (this.pendingCharge) return false;
    this.pendingCharge = {
      chargeId: `ch_${Math.random().toString(36).slice(2, 10)}`,
      amount: this.cart.totals.total,
      currency: this.cart.totals.currency,
    };
    this.emit({ type: "charge_pending", pending: this.pendingCharge });
    return true;
  }

  async resolveCharge(chargeId: string, approve: boolean): Promise<void> {
    if (!this.pendingCharge || this.pendingCharge.chargeId !== chargeId) return;
    const charge = this.pendingCharge;
    this.pendingCharge = null;

    if (!approve) {
      this.emit({
        type: "charge_result",
        result: { chargeId, ok: false, orderId: null, message: "Charge cancelled by user." },
      });
      return;
    }

    this.emit({ type: "charging", chargeId });

    // engine → real world (1): a REAL Stripe test-mode charge, if a test key is
    // configured. No key → attempted:false, we proceed to receipt-only. A live
    // key is refused inside chargeStripeTest. A genuine failure aborts.
    const stripe = await chargeStripeTest(charge.amount, charge.currency);
    if (stripe.attempted && !stripe.ok) {
      this.pendingCharge = null;
      this.emit({
        type: "charge_result",
        result: { chargeId, ok: false, orderId: null, message: `Stripe charge failed: ${stripe.error ?? "unknown error"}` },
      });
      return;
    }

    // engine → real world (2): write a real receipt file through the MCP
    // filesystem server. Use the real Stripe PaymentIntent id as the order id
    // when we have one; otherwise derive deterministically from the chargeId.
    const orderId = stripe.paymentIntentId ?? `ord_${chargeId.replace(/^ch_/, "")}`;
    const receipt = this.buildReceipt(orderId, charge.amount, charge.currency, stripe);
    const w = await writeArtifact("tillpoint", `receipt-${orderId}.txt`, receipt);

    if (!w.ok) {
      this.pendingCharge = null;
      this.emit({
        type: "charge_result",
        result: { chargeId, ok: false, orderId: null, message: `Receipt write failed: ${w.error ?? "unknown error"}` },
      });
      return;
    }

    this.cart.paid = true;
    this.cart.orderId = orderId;
    const how = stripe.attempted
      ? `Stripe test charge ${stripe.status} (${orderId})`
      : `Order ${orderId} confirmed`;
    this.emit({
      type: "charge_result",
      result: {
        chargeId,
        ok: true,
        orderId,
        message: `Charged $${charge.amount.toFixed(2)} ${charge.currency}. ${how} · wrote ${w.relPath}`,
      },
    });
    this.emit({ type: "cart_state", cart: this.cart });
  }

  private buildReceipt(
    orderId: string,
    amount: number,
    currency: string,
    stripe?: { attempted: boolean; status: string | null; paymentIntentId: string | null },
  ): string {
    const t = this.cart.totals;
    const lines = this.cart.items.map(
      (i) => `  ${i.qty} × ${i.name.padEnd(20)} @ $${i.unitPrice.toFixed(2)}  =  $${(i.qty * i.unitPrice).toFixed(2)}`,
    );
    const payment = stripe?.attempted
      ? `Payment: Stripe (test) · PaymentIntent ${stripe.paymentIntentId} · ${stripe.status}`
      : `Payment: simulated (no Stripe test key configured)`;
    return [
      `TILLPOINT — ORDER RECEIPT`,
      `=========================`,
      `Order: ${orderId}`,
      payment,
      this.cart.coupon ? `Coupon: ${this.cart.coupon}${this.cart.couponValid ? "" : " (invalid)"}` : `Coupon: none`,
      this.cart.zip ? `Ship ZIP: ${this.cart.zip} (${this.cart.taxRegion})` : `Ship ZIP: —`,
      ``,
      `Items`,
      `-----`,
      ...lines,
      ``,
      `Subtotal:  $${t.subtotal.toFixed(2)}`,
      `Discount: -$${t.discount.toFixed(2)}`,
      `Shipping:  $${t.shipping.toFixed(2)}`,
      `Tax:       $${t.tax.toFixed(2)}`,
      `-----`,
      `TOTAL:     $${amount.toFixed(2)} ${currency}`,
      ``,
      `Status: PAID`,
    ].join("\n") + "\n";
  }
}
