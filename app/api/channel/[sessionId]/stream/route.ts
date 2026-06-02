import { NextRequest } from "next/server";
import { getSubscription } from "@/lib/channels/manager";
import { encodeFrame, type ChannelFrame } from "@/lib/channels/wire";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/channel/{sessionId}/stream — the craft's single SSE. All of the
// craft's channels multiplex (fan-in) onto this one stream. Data frames flow
// down; the engine is never involved per tick.
export async function GET(req: NextRequest, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  const session = getSubscription(sessionId);
  if (!session) {
    return new Response(JSON.stringify({ error: "subscription not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const write = (frame: ChannelFrame) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeFrame(frame)));
        } catch {
          closed = true;
        }
      };

      const detach = session.attach(write);

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          closed = true;
        }
      }, 15_000);

      const cleanup = () => {
        closed = true;
        clearInterval(heartbeat);
        detach();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
