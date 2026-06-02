import type { CartState, LineItem, Product, Totals } from "./types";

export const CATALOG: Product[] = [
  { id: "tee", name: "Heavyweight Tee", unitPrice: 28 },
  { id: "hoodie", name: "Loopback Hoodie", unitPrice: 72 },
  { id: "cap", name: "6-Panel Cap", unitPrice: 24 },
  { id: "socks", name: "Ribbed Socks (3-pack)", unitPrice: 18 },
];

export function initialItems(): LineItem[] {
  return [
    { productId: "tee", name: "Heavyweight Tee", unitPrice: 28, qty: 2 },
    { productId: "hoodie", name: "Loopback Hoodie", unitPrice: 72, qty: 1 },
  ];
}

interface CouponResult {
  valid: boolean | null;
  note: string | null;
  rate: number; // fraction off subtotal
  freeShip: boolean;
}

function evalCoupon(code: string | null): CouponResult {
  if (!code) return { valid: null, note: null, rate: 0, freeShip: false };
  const c = code.trim().toUpperCase();
  switch (c) {
    case "SAVE10":
      return { valid: true, note: "10% off applied", rate: 0.1, freeShip: false };
    case "SAVE20":
      return { valid: true, note: "20% off applied", rate: 0.2, freeShip: false };
    case "FREESHIP":
      return { valid: true, note: "Free shipping applied", rate: 0, freeShip: true };
    default:
      return { valid: false, note: `"${c}" is not a valid code`, rate: 0, freeShip: false };
  }
}

interface TaxRegion {
  region: string;
  rate: number;
}

function taxForZip(zip: string): TaxRegion {
  const z = zip.trim();
  if (!z) return { region: "—", rate: 0 };
  if (z.startsWith("9")) return { region: "CA", rate: 0.095 };
  if (z.startsWith("1")) return { region: "NY", rate: 0.08875 };
  if (z.startsWith("7")) return { region: "TX", rate: 0.0625 };
  if (z.startsWith("0")) return { region: "DE (no tax)", rate: 0 };
  return { region: "US-avg", rate: 0.07 };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The deterministic "shape" — runs on every state change, no reasoning.
 * This is exactly the kind of formula the spec says the product evaluates for free.
 */
export function recompute(
  items: LineItem[],
  coupon: string | null,
  zip: string,
): { totals: Totals; couponValid: boolean | null; couponNote: string | null; taxRegion: string } {
  const subtotal = round2(items.reduce((a, it) => a + it.unitPrice * it.qty, 0));
  const cp = evalCoupon(coupon);
  const discount = round2(subtotal * cp.rate);
  const afterDiscount = subtotal - discount;

  const baseShipping = afterDiscount > 100 || afterDiscount === 0 ? 0 : 8;
  const shipping = cp.freeShip ? 0 : baseShipping;

  const tax = taxForZip(zip);
  const taxAmount = round2(afterDiscount * tax.rate);

  const total = round2(afterDiscount + shipping + taxAmount);

  return {
    totals: { subtotal, discount, shipping, tax: taxAmount, total, currency: "USD" },
    couponValid: cp.valid,
    couponNote: cp.note,
    taxRegion: tax.region,
  };
}

export function freshCart(): CartState {
  const items = initialItems();
  const { totals, couponValid, couponNote, taxRegion } = recompute(items, null, "");
  return {
    items,
    coupon: null,
    couponValid,
    couponNote,
    zip: "",
    taxRegion,
    totals,
    paid: false,
    orderId: null,
  };
}
