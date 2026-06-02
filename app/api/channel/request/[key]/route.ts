import { NextRequest } from "next/server";
import { requestDirect } from "@/lib/channels/manager";
import type { RequestBody } from "@/lib/channels/wire";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/channel/request/{key} — route:direct. A mechanical asset call
// straight through the channel; it does NOT re-emit the craft. The next poll
// observes the change and flows it back as a normal data frame.
//
// (Path is /request/{key} rather than /{key}/request because the app router
// forbids two different dynamic slug names — [sessionId] and [key] — at the
// same /channel/ level.)
export async function POST(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Partial<RequestBody>;
  if (!body.op) return Response.json({ ok: false, error: "op required" }, { status: 400 });

  const { result, isError } = await requestDirect(decodeURIComponent(key), body.op, body.args ?? {});
  return Response.json({ ok: !isError, result, isError });
}
