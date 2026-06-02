import { NextRequest } from "next/server";
import { getMcpProvider } from "@/lib/mcpdeck/provider";
import { generateCraft } from "@/lib/mcpdeck/generate";
import { createCraftSession } from "@/lib/mcpdeck/craft-session";
import { isProviderId, type ProviderId } from "@/lib/engine/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  prompt: string;
  providerId?: ProviderId;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Body;
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }
  const providerId: ProviderId = isProviderId(body.providerId) ? body.providerId : "sonnet";

  try {
    const provider = await getMcpProvider();
    const { spec, raw } = await generateCraft(prompt, provider, providerId);
    const session = createCraftSession(spec, provider);
    return Response.json({ craftId: session.id, spec, raw, providerKind: provider.kind });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `generation failed: ${message}` }, { status: 500 });
  }
}
