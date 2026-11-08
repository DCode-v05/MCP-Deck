import { getMcpProvider } from "@/lib/mcpdeck/provider";

export const runtime = "nodejs";

export async function GET() {
  const provider = await getMcpProvider();
  return Response.json({ servers: provider.servers, tools: provider.tools, kind: provider.kind });
}
