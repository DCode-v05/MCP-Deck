import { NextRequest } from "next/server";
import { getMcpProvider } from "@/lib/mcpdeck/provider";
import { authorCraft } from "@/lib/crafts/authoring";
import { getOrCreateThread, recordCraft, newThreadId } from "@/lib/crafts/thread-store";
import { isProviderId, type ProviderId } from "@/lib/engine/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  request: string;
  thread_id?: string;
  providerId?: ProviderId;
}

// POST /api/crafts/author — the engine authors a live craft for a request.
// Returns the CraftBlock; the client renders it (live data fills via channels).
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<Body>;
  const request = (body.request ?? "").trim();
  if (!request) return Response.json({ error: "request required" }, { status: 400 });

  const providerId: ProviderId = isProviderId(body.providerId) ? body.providerId : "sonnet";
  const threadId = body.thread_id ?? newThreadId(Math.random().toString(36).slice(2, 10));
  const now = Date.now();
  const ts = new Date(now).toISOString();
  const id = `craft_${Math.random().toString(36).slice(2, 10)}`;

  try {
    const provider = await getMcpProvider();
    const thread = getOrCreateThread(threadId, now);
    const { block, prose } = await authorCraft(request, provider, {
      providerId,
      threadId,
      id,
      ts,
      priorMessages: thread.messages,
    });

    if (!block) {
      return Response.json({ error: "engine did not author a craft", prose }, { status: 422 });
    }

    // Persist on the thread so a route:engine action can resume with context.
    thread.messages.push({ role: "user", content: request });
    thread.messages.push({ role: "assistant", content: `<craft key="${block.payload.key}">…authored…</craft>` });
    recordCraft(block);

    return Response.json({ thread_id: threadId, block, prose, providerKind: provider.kind });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `authoring failed: ${message}` }, { status: 500 });
  }
}
