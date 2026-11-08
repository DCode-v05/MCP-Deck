import { NextRequest } from "next/server";
import { subscribeChannels } from "@/lib/channels/manager";
import type { SubscribeRequest, SubscribeResponse } from "@/lib/channels/wire";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const res: SubscribeResponse = { session_id: out.sessionId, channels: out.channels };
  return Response.json(res);
}
