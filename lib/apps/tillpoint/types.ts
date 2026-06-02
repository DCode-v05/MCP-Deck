/**
 * Tillpoint — a live checkout cart. Demonstrates all three bidirectional flows:
 *  - UI → engine: qty steppers, coupon, zip flow in as live state (not a new turn)
 *  - engine → UI: totals recompute and server-push back into the same widget
 *  - engine → real world: checkout is approval-gated; on approval it writes a
 *    real receipt file through the MCP filesystem server (a real side effect).
 *    A real Stripe charge would slot in here behind a test key.
 */

export interface Product {
  id: string;
  name: string;
  unitPrice: number;
}

export interface LineItem {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
}

export interface Totals {
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  currency: string;
}

export interface CartState {
  items: LineItem[];
  coupon: string | null;
  couponValid: boolean | null;
  couponNote: string | null;
  zip: string;
  taxRegion: string;
  totals: Totals;
  paid: boolean;
  orderId: string | null;
}

export interface PendingCharge {
  chargeId: string;
  amount: number;
  currency: string;
}

export interface ChargeResult {
  chargeId: string;
  ok: boolean;
  orderId: string | null;
  message: string;
}

export type TillpointEvent =
  | { type: "session_ready"; sessionId: string }
  | { type: "cart_state"; cart: CartState } // server-push: engine → UI, no new turn
  | { type: "charge_pending"; pending: PendingCharge } // pause-on-approval
  | { type: "charging"; chargeId: string }
  | { type: "charge_result"; result: ChargeResult } // engine → real world verdict
  | { type: "log"; message: string };

export type TillpointMessage =
  | { kind: "set_qty"; productId: string; qty: number }
  | { kind: "set_coupon"; code: string }
  | { kind: "set_zip"; zip: string }
  | { kind: "checkout" }
  | { kind: "resolve_charge"; chargeId: string; approve: boolean };
