import { NextRequest } from "next/server";
import { refreshSession } from "@/lib/channels/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/channel/{sessionId}/refresh — force an immediate re-poll of all of
// this session's channels. Fresh snapshots fan out over the open SSE, so the
// live view updates NOW (e.g. after creating a repo elsewhere), without waiting
// for the next scheduled poll tick.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  const polled = await refreshSession(sessionId);
  return Response.json({ ok: polled > 0, polled });
}
