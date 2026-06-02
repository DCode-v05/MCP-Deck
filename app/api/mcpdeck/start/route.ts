import { NextRequest } from "next/server";
import { createSession, getSession } from "@/lib/mcpdeck/session";
import { getMcpProvider } from "@/lib/mcpdeck/provider";
import { runMcpDeck } from "@/lib/mcpdeck/engine";
import { isProviderId, type ProviderId } from "@/lib/engine/providers";
import type { McpDeckEvent } from "@/lib/mcpdeck/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StartBody {
  goal: string;
  providerId?: ProviderId;
  sessionId?: string;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as StartBody;
  const providerId: ProviderId = isProviderId(body.providerId) ? body.providerId : "sonnet";
  const goal = (body.goal ?? "").trim();

  if (!goal) {
    return new Response(JSON.stringify({ error: "goal is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Reuse session if the client supplied an existing one and it still exists,
  // otherwise create one bound to the active provider (mock or real MCP).
  const provider = await getMcpProvider();
  const session =
    (body.sessionId && getSession(body.sessionId)) || createSession(provider);

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

      // Burst current state to the new subscriber.
      session.emitSnapshot();

      // Fire the engine — its events stream through the subscriber above.
      // We do NOT await here; the SSE response stays open as the engine runs.
      runMcpDeck(session, { providerId, goal }).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        session.emit({ type: "error", message: msg });
      });

      // Heartbeat every 15s to keep the connection alive through proxies.
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
      "X-Session-Id": session.sessionId,
    },
  });
}
