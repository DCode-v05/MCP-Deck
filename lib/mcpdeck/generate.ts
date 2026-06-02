import { getProvider, type ProviderId } from "@/lib/engine/providers";
import type { AgentMessage } from "@/lib/engine/tools";
import type { McpProvider } from "./provider";
import { extractJson, validateCraft, type CraftSpec } from "./craft";

function buildSystemPrompt(provider: McpProvider): string {
  const lines: string[] = [
    `You are a UI-authoring engine. Given a user's request, you AUTHOR a "craft":`,
    `a live app that binds to MCP tools. You do not write prose — you output ONE JSON object only.`,
    ``,
    `# Available MCP servers and tools (you may ONLY use these toolIds)`,
  ];
  for (const s of provider.servers) {
    lines.push(`\n## ${s.id} — ${s.name}: ${s.description}`);
    for (const tool of provider.tools.filter((t) => t.serverId === s.id)) {
      const props = Object.entries(tool.inputSchema.properties)
        .map(([k, v]) => `${k}:${v.type}${v.enum ? `(${v.enum.join("|")})` : ""}`)
        .join(", ");
      lines.push(
        `- ${tool.id}${tool.hasSideEffect ? " [SIDE EFFECT]" : ""} — ${tool.description}` +
          (props ? `  args: { ${props} }` : "  args: {}"),
      );
    }
  }

  lines.push(
    ``,
    `# Output schema — emit exactly this JSON shape, nothing else`,
    `{`,
    `  "title": string,`,
    `  "summary": string,                       // one sentence describing the app`,
    `  "accent": string,                        // hex colour like "#2E86C0"`,
    `  "dataSources": [                          // READ-ONLY tool calls that populate the UI`,
    `    { "id": "kebab-id", "label": "Human label", "toolId": "<known tool>", "args": { ... } }`,
    `  ],`,
    `  "blocks": [                               // how to render the data sources`,
    `    { "kind": "stat"|"table"|"list"|"source"|"text", "title": "...", "source": "<dataSource id>", "text": "..." }`,
    `  ],`,
    `  "actions": [                              // buttons the user can press (often SIDE EFFECT tools)`,
    `    { "id": "kebab-id", "label": "Do the thing", "toolId": "<known tool>", "args": { ... } }`,
    `  ]`,
    `}`,
    ``,
    `# Rules`,
    `- Use 1-4 dataSources with READ-ONLY tools (list/read/status/log/search) to fill the dashboard.`,
    `- "source" blocks show a tool result verbatim; "list"/"table" split it into lines/rows; "stat" shows a headline.`,
    `- Add 1-3 actions using SIDE EFFECT tools when the request implies doing something (write/create/comment/branch).`,
    `- Every toolId MUST be one of the tools listed above. Put realistic args matching each tool's schema.`,
    `- Output ONLY the JSON object. No markdown, no commentary.`,
  );
  return lines.join("\n");
}

export async function generateCraft(
  prompt: string,
  provider: McpProvider,
  providerId: ProviderId = "sonnet",
): Promise<{ spec: CraftSpec; raw: string }> {
  const invoker = getProvider(providerId);
  const messages: AgentMessage[] = [{ role: "user", content: prompt }];
  const turn = invoker(buildSystemPrompt(provider), messages, []);

  let text = "";
  for await (const ev of turn.stream) {
    if (ev.type === "text") text += ev.delta;
  }
  await turn.done();

  const parsed = extractJson(text);
  const spec = validateCraft(parsed, provider);
  return { spec, raw: text };
}
