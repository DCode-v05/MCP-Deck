"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CartState,
  ChargeResult,
  PendingCharge,
  TillpointEvent,
  TillpointMessage,
} from "@/lib/apps/tillpoint/types";

async function* parseSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<TillpointEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let data = "";
      for (const line of block.split("\n")) if (line.startsWith("data:")) data += line.slice(5).trim();
      if (!data) continue;
      try {
        yield JSON.parse(data) as TillpointEvent;
      } catch {
        /* ignore */
      }
    }
  }
}

export function useTillpoint() {
  const [cart, setCart] = useState<CartState | null>(null);
  const [pendingCharge, setPendingCharge] = useState<PendingCharge | null>(null);
  const [charging, setCharging] = useState(false);
  const [lastResult, setLastResult] = useState<ChargeResult | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/apps/tillpoint/open", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) return;
        const sid = res.headers.get("X-Session-Id");
        if (sid) sessionIdRef.current = sid;
        for await (const ev of parseSse(res.body)) {
          switch (ev.type) {
            case "session_ready":
              sessionIdRef.current = ev.sessionId;
              break;
            case "cart_state":
              setCart(ev.cart);
              break;
            case "charge_pending":
              setPendingCharge(ev.pending);
              break;
            case "charging":
              setCharging(true);
              break;
            case "charge_result":
              setCharging(false);
              setPendingCharge(null);
              setLastResult(ev.result);
              break;
          }
        }
      } catch {
        /* aborted or network */
      }
    })();
    return () => ctrl.abort();
  }, []);

  const send = useCallback(async (message: TillpointMessage) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    await fetch("/api/apps/tillpoint/input", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message }),
    });
  }, []);

  const setQty = useCallback((productId: string, qty: number) => send({ kind: "set_qty", productId, qty }), [send]);
  const setCoupon = useCallback((code: string) => send({ kind: "set_coupon", code }), [send]);
  const setZip = useCallback((zip: string) => send({ kind: "set_zip", zip }), [send]);
  const checkout = useCallback(() => {
    setLastResult(null);
    return send({ kind: "checkout" });
  }, [send]);
  const resolveCharge = useCallback(
    (chargeId: string, approve: boolean) => send({ kind: "resolve_charge", chargeId, approve }),
    [send],
  );

  return { cart, pendingCharge, charging, lastResult, setQty, setCoupon, setZip, checkout, resolveCharge };
}
