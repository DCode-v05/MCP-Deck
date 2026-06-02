import { NextRequest } from "next/server";
import { getLiveApp } from "@/lib/apps/kit/session";
import type { LiveAppMessage } from "@/lib/apps/kit/types";

export const runtime = "nodejs";

interface Body {
  sessionId: string;
  message: LiveAppMessage;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Body;
  const session = getLiveApp(body.sessionId);
  if (!session) return Response.json({ ok: false, error: "session not found" }, { status: 404 });

  const m = body.message;
  switch (m.kind) {
    case "set_field":
      session.setField(m.key, m.value);
      return Response.json({ ok: true });
    case "set_fields":
      session.setFields(m.values);
      return Response.json({ ok: true });
    case "run_action":
      return Response.json({ ok: session.runAction() });
    case "resolve_action":
      void session.resolveAction(m.actionId, m.approve);
      return Response.json({ ok: true });
    default: {
      const exhaustive: never = m;
      void exhaustive;
      return Response.json({ ok: false }, { status: 400 });
    }
  }
}
