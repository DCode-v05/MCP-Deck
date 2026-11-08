import { listSessions } from "@/lib/mcpdeck/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface RunSummary {
  sessionId: string;
  goal: string;
  startedAt: number;
  status: string;
  summary: string | null;
}

export async function GET() {
  const runs: RunSummary[] = listSessions()
    .filter((s) => s.goal)
    .map((s) => ({
      sessionId: s.sessionId,
      goal: s.goal as string,
      startedAt: s.startedAt,
      status: s.status,
      summary: s.finalSummary,
    }))
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 50);
  return Response.json({ runs });
}
