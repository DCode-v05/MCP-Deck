import { NextRequest } from "next/server";
import { getSession } from "@/lib/mcpdeck/session";
import type { McpDeckEvent } from "@/lib/mcpdeck/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reconnect endpoint: subscribe to an existing session without starting a new run.
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId") ?? "";
  const session = getSession(sessionId);
  if (!session) {
    return new Response(JSON.stringify({ error: "session not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const write = (ev: McpDeckEvent) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`),
          );
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

      const cleanup = () => {
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
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
