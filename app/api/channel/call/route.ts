import { NextRequest } from "next/server";
import { pollSource } from "@/lib/channels/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/channel/call — a keyless route:direct call. Runs a tool op directly
// (the same mechanical asset call a channel relays), with NO subscription
// required. Writes (create/update/patch/post) go here so they work regardless
// of which channel a craft happens to subscribe to. The next refresh re-polls
// the read channels so the change shows live.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { op?: string; args?: Record<string, unknown> };
  if (!body.op) return Response.json({ ok: false, error: "op required" }, { status: 400 });
  const { payload, isError } = await pollSource(body.op, body.args ?? {}, 0);
  return Response.json({ ok: !isError, result: payload, isError });
}
