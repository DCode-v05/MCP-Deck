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

/**
 * Build a provider backed by real MCP servers. Config is a JSON array in
 * MCPDECK_SERVERS, e.g.:
 *   [{"id":"github","name":"GitHub","command":"npx",
 *     "args":["-y","@modelcontextprotocol/server-github"]}]
 * Each server is spawned over stdio, its tools discovered, and tool calls
 * routed back through the client.
 */
export async function buildRealProvider(rawConfig: string): Promise<McpProvider | null> {
  let configs: ServerConfig[];
  try {
    configs = JSON.parse(rawConfig);
    if (!Array.isArray(configs)) throw new Error("MCPDECK_SERVERS must be a JSON array");
  } catch (err) {
    console.error("[mcpdeck] invalid MCPDECK_SERVERS:", err);
    return null;
  }

  // Skip servers whose required credential is missing BEFORE spawning them.
  // This avoids the noisy "failed to connect" stack traces for unconfigured
  // SaaS servers, and prevents tokenless servers (GitHub/Notion start anyway)
  // from appearing "connected" when they can't actually authenticate.
  const runnable = configs.filter((cfg) => {
    // The filesystem server is intentionally disabled — drop it even if it's
    // still listed in MCPDECK_SERVERS, so it never connects or appears.
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

  // Connect runnable servers in parallel; a server that fails or times out is
  // simply dropped (the others still work). A hanging server can't stall the rest.
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
      // Root node id == "<serverId>:/" — list that server's resources.
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

// First `npx -y` of an uncached server can be slow; give each a generous window
// but never let one hang the whole catalogue.
const CONNECT_TIMEOUT_MS = 45_000;

/**
 * Required credential env vars per known server id. Each inner array is a group
 * where AT LEAST ONE must be set (so GitHub accepts either token name); multiple
 * arrays mean ALL groups are required (Slack needs a token AND a team id).
 * Servers not listed here (e.g. fs) have no credential requirement.
 */
const REQUIRED_CREDENTIALS: Record<string, string[][]> = {
  github: [["GITHUB_PERSONAL_ACCESS_TOKEN", "GITHUB_TOKEN"]],
  notion: [["NOTION_TOKEN", "OPENAPI_MCP_HEADERS"]],
  linear: [["LINEAR_API_TOKEN"]],
  slack: [["SLACK_BOT_TOKEN"], ["SLACK_TEAM_ID"]],
};

/** The filesystem server is intentionally unsupported — match it by id or package. */
function isFilesystemServer(cfg: ServerConfig): boolean {
  if (/^(fs|filesystem|file-system)$/i.test(cfg.id)) return true;
  const blob = `${cfg.command} ${(cfg.args ?? []).join(" ")}`.toLowerCase();
  return blob.includes("server-filesystem");
}

/** Returns the credential groups that are NOT satisfied for a server id (empty = good to run). */
function missingCredentials(serverId: string): string[] {
  const groups = REQUIRED_CREDENTIALS[serverId];
  if (!groups) return []; // no requirement (e.g. fs)
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
  // On Windows, `npx`/`npm` are .cmd shims and must be spawned by their full name.
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
    // Heuristic: write/create/delete/send-style tools have side effects.
    // Heuristic: any mutating verb in the tool name -> a real side effect (gated
    // behind approval). Broad on purpose: it's safer to over-flag a read as a
    // write (extra confirm) than to let a write fire unconfirmed.
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

// Credential env vars that real SaaS MCP servers read. Passed through from the
// parent process so a token can live on its own .env line instead of being
// embedded inside the MCPDECK_SERVERS JSON blob. Add new ones here as needed.
const CREDENTIAL_ENV_KEYS = [
  // GitHub
  "GITHUB_PERSONAL_ACCESS_TOKEN",
  "GITHUB_TOKEN",
  // Slack
  "SLACK_BOT_TOKEN",
  "SLACK_TEAM_ID",
  "SLACK_CHANNEL_IDS",
  // Notion (@notionhq/notion-mcp-server reads NOTION_TOKEN, or OPENAPI_MCP_HEADERS)
  "NOTION_TOKEN",
  "OPENAPI_MCP_HEADERS",
  // Linear (@tacticlaunch/mcp-linear reads LINEAR_API_TOKEN)
  "LINEAR_API_TOKEN",
];

function getDefaultEnv(): Record<string, string> {
  // Pass through a minimal, safe subset of the parent env, plus any configured
  // SaaS credentials. Windows vars (SystemRoot/APPDATA/…) are required for npx
  // to resolve and spawn on win32.
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
