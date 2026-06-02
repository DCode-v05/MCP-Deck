import { NextRequest } from "next/server";
import { subscribeChannels } from "@/lib/channels/manager";
import type { SubscribeRequest, SubscribeResponse } from "@/lib/channels/wire";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/channel/subscribe — create a fan-in subscription session for a craft.
// The SSE stream is opened separately at /api/channel/{sessionId}/stream.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<SubscribeRequest>;
  const channels = Array.isArray(body.channels) ? body.channels : [];
  if (channels.length === 0) {
    return Response.json({ error: "channels[] required" }, { status: 400 });
  }
  const out = await subscribeChannels({
    threadId: body.thread_id ?? "thr_anon",
    craftId: body.craft_id ?? "craft_anon",
    channels,
  });
  // Map the internal (camelCase) result onto the snake_case wire contract so the
  // client's `session_id` destructure works (was returning undefined -> 404).
  const res: SubscribeResponse = { session_id: out.sessionId, channels: out.channels };
  return Response.json(res);
}
