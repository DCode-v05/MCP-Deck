import { NextRequest } from "next/server";
import { createLiveApp, getLiveApp } from "@/lib/apps/kit/session";
import type { LiveAppEvent } from "@/lib/apps/kit/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ appId: string }> }) {
  const { appId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { sessionId?: string };

  const session = (body.sessionId && getLiveApp(body.sessionId)) || createLiveApp(appId);
  if (!session) {
    return new Response(JSON.stringify({ error: `unknown app "${appId}"` }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const write = (ev: LiveAppEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const unsubscribe = session.subscribe(write);
      session.emitSnapshot();

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          closed = true;
        }
      }, 15_000);

      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Session-Id": session.sessionId,
    },
  });
}
