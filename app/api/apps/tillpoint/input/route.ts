import { NextRequest } from "next/server";
import { getTillpoint } from "@/lib/apps/tillpoint/session";
import type { TillpointMessage } from "@/lib/apps/tillpoint/types";

export const runtime = "nodejs";

interface Body {
  sessionId: string;
  message: TillpointMessage;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Body;
  const session = getTillpoint(body.sessionId);
  if (!session) return Response.json({ ok: false, error: "session not found" }, { status: 404 });

  const m = body.message;
  switch (m.kind) {
    case "set_qty":
      session.setQty(m.productId, m.qty);
      return Response.json({ ok: true });
    case "set_coupon":
      session.setCoupon(m.code);
      return Response.json({ ok: true });
    case "set_zip":
      session.setZip(m.zip);
      return Response.json({ ok: true });
    case "checkout":
      return Response.json({ ok: session.checkout() });
    case "resolve_charge":
      void session.resolveCharge(m.chargeId, m.approve);
      return Response.json({ ok: true });
    default: {
      const exhaustive: never = m;
      void exhaustive;
      return Response.json({ ok: false }, { status: 400 });
    }
  }
}
