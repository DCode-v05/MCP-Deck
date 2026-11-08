import { NextRequest } from "next/server";
import { pollSource } from "@/lib/channels/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { op?: string; args?: Record<string, unknown> };
  if (!body.op) return Response.json({ ok: false, error: "op required" }, { status: 400 });
  const { payload, isError } = await pollSource(body.op, body.args ?? {}, 0);
  return Response.json({ ok: !isError, result: payload, isError });
}
