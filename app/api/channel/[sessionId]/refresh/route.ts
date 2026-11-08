import { NextRequest } from "next/server";
import { refreshSession } from "@/lib/channels/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  const polled = await refreshSession(sessionId);
  return Response.json({ ok: polled > 0, polled });
}
