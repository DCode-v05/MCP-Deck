import { NextRequest } from "next/server";
import { getCraftSession } from "@/lib/mcpdeck/craft-session";

export const runtime = "nodejs";

interface Body {
  craftId: string;
  toolId: string;
  args?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Body;
  const session = getCraftSession(body.craftId);
  if (!session) return Response.json({ ok: false, error: "craft not found" }, { status: 404 });

  const { result, isError } = await session.runTool(body.toolId, body.args ?? {});
  return Response.json({ ok: !isError, result, isError });
}
