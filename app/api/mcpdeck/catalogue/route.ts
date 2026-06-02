import { getMcpProvider } from "@/lib/mcpdeck/provider";

export const runtime = "nodejs";

// Server/tool info from the active provider (mock catalogue, or real MCP
// servers if MCPDECK_SERVERS is configured). Per-session state flows via SSE.
export async function GET() {
  const provider = await getMcpProvider();
  return Response.json({ servers: provider.servers, tools: provider.tools, kind: provider.kind });
}
