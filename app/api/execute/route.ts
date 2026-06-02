import { NextRequest } from "next/server";
import { getMcpProvider } from "@/lib/mcpdeck/provider";
import { authorCraft } from "@/lib/crafts/authoring";
import { getThread, getCraftById, recordCraft } from "@/lib/crafts/thread-store";
import { bumpCraftVersion } from "@/lib/crafts/craft-block";
import { isProviderId, type ProviderId } from "@/lib/engine/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/execute — the §6 route:engine entry. A craft-emit stamped
 * route:engine (or a free-text follow-up / edit) RESUMES the thread: the engine
 * re-authors the SAME craft key with the new intent + prior thread context, and
 * returns version+1. This is the "to and fro" through the reasoning loop —
 * unlike route:direct, which is a mechanical channel call with no engine.
 */
interface BlockInput {
  thread_id: string;
  block_id: string; // the craft's wire id
  action?: string; // emitted action name
  text: string; // free-text intent ("add fuel level", "draft a reply", …)
  providerId?: ProviderId;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<BlockInput>;
  const threadId = body.thread_id ?? "";
  const text = (body.text ?? "").trim();
  if (!threadId || !text) return Response.json({ error: "thread_id and text required" }, { status: 400 });

  const providerId: ProviderId = isProviderId(body.providerId) ? body.providerId : "sonnet";
  const now = Date.now();
  const ts = new Date(now).toISOString();

  const thread = getThread(threadId);
  if (!thread) return Response.json({ error: "thread not found" }, { status: 404 });

  const prior = body.block_id ? getCraftById(threadId, body.block_id) : undefined;

  try {
    const provider = await getMcpProvider();
    // Resume: re-author with the thread's message history as context + the new intent.
    const intent = prior
      ? `Update the "${prior.payload.title}" craft (key "${prior.payload.key}"): ${text}. Re-author the full <craft> reflecting this.`
      : text;

    const { block } = await authorCraft(intent, provider, {
      providerId,
      threadId,
      id: prior?.id ?? `craft_${Math.random().toString(36).slice(2, 10)}`,
      ts,
      priorMessages: thread.messages,
    });

    if (!block) return Response.json({ error: "engine did not produce a craft" }, { status: 422 });

    // §9–10: an edit keeps the same id/key and bumps version.
    const finalBlock = prior
      ? bumpCraftVersion({ ...prior }, block.payload, ts)
      : block;

    thread.messages.push({ role: "user", content: text });
    thread.messages.push({ role: "assistant", content: `<craft key="${finalBlock.payload.key}" v="${finalBlock.payload.version}">…</craft>` });
    recordCraft(finalBlock);

    return Response.json({ thread_id: threadId, block: finalBlock });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `execute failed: ${message}` }, { status: 500 });
  }
}
