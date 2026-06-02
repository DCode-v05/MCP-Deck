import { NextRequest } from "next/server";
import { getSession } from "@/lib/mcpdeck/session";
import { replayToolCall, branchFrom } from "@/lib/mcpdeck/engine";
import { isProviderId, type ProviderId } from "@/lib/engine/providers";
import type { UpstreamMessage } from "@/lib/mcpdeck/types";

export const runtime = "nodejs";

interface InputBody {
  sessionId: string;
  message: UpstreamMessage;
  providerId?: ProviderId;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as InputBody;
  const session = getSession(body.sessionId);
  if (!session) {
    return Response.json({ ok: false, error: "session not found" }, { status: 404 });
  }

  const m = body.message;
  switch (m.kind) {
    case "approval": {
      const ok = session.resolveApproval(m.requestId, m.verdict);
      return Response.json({ ok });
    }
    case "toggle_server":
      session.toggleServer(m.serverId, m.enabled);
      return Response.json({ ok: true });
    case "pin_tool":
      session.pinTool(m.toolId, m.pinned);
      return Response.json({ ok: true });
    case "expand_resource":
      void session.expandResourceNode(m.nodeId).catch((err) => {
        session.logEvent("error", `expand failed: ${err instanceof Error ? err.message : String(err)}`);
      });
      return Response.json({ ok: true });
    case "stop":
      session.requestStop();
      return Response.json({ ok: true });
    case "replay":
      // Fire-and-forget: events stream to subscribers via the session.
      void replayToolCall(session, m.replayId, m.editedArgs).catch((err) => {
        session.logEvent("error", `replay failed: ${err instanceof Error ? err.message : String(err)}`);
      });
      return Response.json({ ok: true });
    case "branch": {
      const providerId: ProviderId = isProviderId(body.providerId) ? body.providerId : "sonnet";
      void branchFrom(session, m.replayId, m.newGoal, providerId).catch((err) => {
        session.logEvent("error", `branch failed: ${err instanceof Error ? err.message : String(err)}`);
      });
      return Response.json({ ok: true });
    }
    default: {
      const exhaustive: never = m;
      void exhaustive;
      return Response.json({ ok: false, error: "unknown message" }, { status: 400 });
    }
  }
}
