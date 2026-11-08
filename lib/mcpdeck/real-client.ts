import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { McpProvider } from "./provider";
import type { McpServerInfo, McpToolInfo, McpResourceNode } from "./types";

interface ServerConfig {
  id: string;
  name?: string;
  description?: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface Connected {
  config: ServerConfig;
  client: Client;
  tools: McpToolInfo[];
}

export async function buildRealProvider(rawConfig: string): Promise<McpProvider | null> {
  let configs: ServerConfig[];
  try {
    configs = JSON.parse(rawConfig);
    if (!Array.isArray(configs)) throw new Error("MCPDECK_SERVERS must be a JSON array");
  } catch (err) {
    console.error("[mcpdeck] invalid MCPDECK_SERVERS:", err);
    return null;
  }

  const runnable = configs.filter((cfg) => {
    if (isFilesystemServer(cfg)) {
      console.info(`[mcpdeck] filesystem server "${cfg.id}" is disabled — skipping (remove it from MCPDECK_SERVERS).`);
      return false;
    }
    const missing = missingCredentials(cfg.id);
    if (missing.length > 0) {
      console.info(`[mcpdeck] skipping "${cfg.id}" — set ${missing.join(" + ")} in .env to enable it.`);
      return false;
    }
    return true;
  });

  if (runnable.length === 0) return null;

  const results = await Promise.all(
    runnable.map(async (cfg) => {
      try {
        return await withTimeout(connectOne(cfg), CONNECT_TIMEOUT_MS, cfg.id);
      } catch (err) {
        console.error(`[mcpdeck] failed to connect server "${cfg.id}":`, err instanceof Error ? err.message : err);
        return null;
      }
    }),
  );
  const connected: Connected[] = results.filter((c): c is Connected => c !== null);

  if (connected.length === 0) return null;

  const servers: McpServerInfo[] = connected.map((c) => ({
    id: c.config.id,
    name: c.config.name ?? c.config.id,
    description: c.config.description ?? `MCP server (${c.config.command})`,
    toolIds: c.tools.map((t) => t.id),
    resourceRoot: `${c.config.id}:/`,
    latencyMs: 60,
  }));

  const tools: McpToolInfo[] = connected.flatMap((c) => c.tools);

  const initialResources: McpResourceNode[] = connected.map((c) => ({
    id: `${c.config.id}:/`,
    serverId: c.config.id,
    parentId: null,
    name: c.config.name ?? c.config.id,
    kind: "folder",
    preview: null,
    expandable: true,
  }));

  const byServer = new Map(connected.map((c) => [c.config.id, c]));
  const toolIndex = new Map(tools.map((t) => [t.id, t]));

  return {
    kind: "real",
    servers,
    tools,
    initialResources,
    findServer: (id) => servers.find((s) => s.id === id),
    findTool: (id) => toolIndex.get(id),
    async callTool(toolId, args) {
      const tool = toolIndex.get(toolId);
      const conn = tool ? byServer.get(tool.serverId) : undefined;
      if (!tool || !conn) return { result: `Unknown tool: ${toolId}`, isError: true };
      try {
        const res = await conn.client.callTool({
          name: stripServerPrefix(toolId, conn.config.id),
          arguments: args,
        });
        return { result: contentToText(res.content), isError: Boolean(res.isError) };
      } catch (err) {
        return { result: err instanceof Error ? err.message : String(err), isError: true };
      }
    },
    async expandResource(nodeId) {
      const serverId = nodeId.replace(/:.*/, "");
      const conn = byServer.get(serverId);
      if (!conn) return [];
      try {
        const res = await conn.client.listResources();
        return (res.resources ?? []).slice(0, 50).map((r) => ({
          id: `${serverId}:${r.uri}`,
          serverId,
          parentId: nodeId,
          name: r.name ?? r.uri,
          kind: "file" as const,
          preview: r.mimeType ?? null,
          expandable: false,
        }));
      } catch {
        return [];
      }
    },
  };
}

const CONNECT_TIMEOUT_MS = 45_000;

const REQUIRED_CREDENTIALS: Record<string, string[][]> = {
  github: [["GITHUB_PERSONAL_ACCESS_TOKEN", "GITHUB_TOKEN"]],
  notion: [["NOTION_TOKEN", "OPENAPI_MCP_HEADERS"]],
  linear: [["LINEAR_API_TOKEN"]],
  slack: [["SLACK_BOT_TOKEN"], ["SLACK_TEAM_ID"]],
};

function isFilesystemServer(cfg: ServerConfig): boolean {
  if (/^(fs|filesystem|file-system)$/i.test(cfg.id)) return true;
  const blob = `${cfg.command} ${(cfg.args ?? []).join(" ")}`.toLowerCase();
  return blob.includes("server-filesystem");
}

function missingCredentials(serverId: string): string[] {
  const groups = REQUIRED_CREDENTIALS[serverId];
  if (!groups) return [];
  const missing: string[] = [];
  for (const group of groups) {
    const satisfied = group.some((k) => (process.env[k]?.trim() ?? "") !== "");
    if (!satisfied) missing.push(group.join("|"));
  }
  return missing;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`connect timed out after ${ms}ms`)), ms).unref?.(),
    ),
  ]);
}

async function connectOne(cfg: ServerConfig): Promise<Connected> {
  const command =
    process.platform === "win32" && /^(npx|npm)$/.test(cfg.command)
      ? `${cfg.command}.cmd`
      : cfg.command;
  const transport = new StdioClientTransport({
    command,
    args: cfg.args ?? [],
    env: { ...getDefaultEnv(), ...(cfg.env ?? {}) },
  });
  const client = new Client(
    { name: "mcpdeck", version: "0.1.0" },
    { capabilities: {} },
  );
  await client.connect(transport);

  const listed = await client.listTools();
  const tools: McpToolInfo[] = (listed.tools ?? []).map((t) => ({
    id: `${cfg.id}.${t.name}`,
    serverId: cfg.id,
    name: `${cfg.id}.${t.name}`,
    description: t.description ?? "",
    inputSchema: normalizeSchema(t.inputSchema),
    hasSideEffect:
      /write|create|delete|update|patch|send|set|put|^post|add|remove|move|rename|comment|archive|invite|merge|close|reopen|assign|upload|edit|destroy|cancel|approve|reject/i.test(
        t.name,
      ),
  }));

  return { config: cfg, client, tools };
}

function stripServerPrefix(toolId: string, serverId: string): string {
  return toolId.startsWith(`${serverId}.`) ? toolId.slice(serverId.length + 1) : toolId;
}

const CREDENTIAL_ENV_KEYS = [
  "GITHUB_PERSONAL_ACCESS_TOKEN",
  "GITHUB_TOKEN",
  "SLACK_BOT_TOKEN",
  "SLACK_TEAM_ID",
  "SLACK_CHANNEL_IDS",
  "NOTION_TOKEN",
  "OPENAPI_MCP_HEADERS",
  "LINEAR_API_TOKEN",
];

function getDefaultEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  const keys = [
    "PATH", "Path", "HOME", "USER", "SHELL", "LANG", "TMPDIR", "TEMP", "TMP",
    "SystemRoot", "APPDATA", "LOCALAPPDATA", "ProgramFiles", "ProgramData", "COMSPEC", "PATHEXT",
    ...CREDENTIAL_ENV_KEYS,
  ];
  for (const k of keys) {
    const v = process.env[k];
    if (v) out[k] = v;
  }
  return out;
}

type ToolInputSchema = McpToolInfo["inputSchema"];

function normalizeSchema(schema: unknown): ToolInputSchema {
  const empty: ToolInputSchema = { type: "object", properties: {} };
  if (!schema || typeof schema !== "object") return empty;
  const s = schema as {
    properties?: Record<string, { type?: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
  const properties: ToolInputSchema["properties"] = {};
  for (const [k, v] of Object.entries(s.properties ?? {})) {
    properties[k] = {
      type: typeof v?.type === "string" ? v.type : "string",
      description: v?.description,
      enum: Array.isArray(v?.enum) ? v.enum : undefined,
    };
  }
  return { type: "object", properties, required: s.required };
}

function contentToText(content: unknown): string {
  if (!Array.isArray(content)) return String(content ?? "");
  return content
    .map((block) => {
      if (block && typeof block === "object" && "text" in block) {
        return String((block as { text: unknown }).text ?? "");
      }
      if (block && typeof block === "object" && "type" in block) {
        return `[${String((block as { type: unknown }).type)}]`;
      }
      return String(block);
    })
    .join("\n");
}
