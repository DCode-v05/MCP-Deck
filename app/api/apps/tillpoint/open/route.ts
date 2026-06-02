import { NextRequest } from "next/server";
import { createTillpoint, getTillpoint } from "@/lib/apps/tillpoint/session";
import type { TillpointEvent } from "@/lib/apps/tillpoint/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Open (or re-attach to) a Tillpoint cart and stream its live state over SSE.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { sessionId?: string };
  const session = (body.sessionId && getTillpoint(body.sessionId)) || createTillpoint();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const write = (ev: TillpointEvent) => {
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
