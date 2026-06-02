import type { McpProvider } from "./provider";

/**
 * A "craft" is a live app the ENGINE authors from a prompt (not hand-coded).
 * It binds to real MCP tools: data sources populate the UI (engine→UI), action
 * buttons perform side effects gated by approval (engine→real world).
 *
 * The LLM emits this as JSON; the product renders + runs it.
 */

export interface CraftDataSource {
  id: string; // local name referenced by blocks
  label: string;
  toolId: string; // must be a known MCP tool
  args: Record<string, unknown>;
}

export type CraftBlock =
  | { kind: "stat"; title: string; source: string }
  | { kind: "table"; title: string; source: string }
  | { kind: "list"; title: string; source: string }
  | { kind: "source"; title: string; source: string }
  | { kind: "text"; title: string; text: string };

export interface CraftAction {
  id: string;
  label: string;
  toolId: string; // must be a known MCP tool
  args: Record<string, unknown>;
  sideEffect: boolean;
}

export interface CraftSpec {
  title: string;
  summary: string;
  accent: string;
  dataSources: CraftDataSource[];
  blocks: CraftBlock[];
  actions: CraftAction[];
}

const ACCENTS = ["#EC3B4A", "#2E86C0", "#1F9D57", "#7A4DD6", "#C0642E", "#0E8C7F"];

/** Extract the first balanced JSON object from an LLM response (handles ``` fences + prose). */
export function extractJson(raw: string): unknown {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("no JSON object found");
  return JSON.parse(s.slice(start, end + 1));
}

/**
 * Validate + sanitise an LLM-authored spec against the live provider:
 * drop unknown tools, dangling block sources, etc. Returns a safe CraftSpec.
 */
export function validateCraft(input: unknown, provider: McpProvider): CraftSpec {
  const obj = (input ?? {}) as Record<string, unknown>;
  const knownTool = (id: unknown): id is string =>
    typeof id === "string" && Boolean(provider.findTool(id));

  const dataSources: CraftDataSource[] = Array.isArray(obj.dataSources)
    ? obj.dataSources
        .map((d) => d as Record<string, unknown>)
        .filter((d) => knownTool(d.toolId) && typeof d.id === "string")
        .map((d) => ({
          id: String(d.id),
          label: typeof d.label === "string" ? d.label : String(d.toolId),
          toolId: String(d.toolId),
          args: (d.args && typeof d.args === "object" ? d.args : {}) as Record<string, unknown>,
        }))
    : [];

  const sourceIds = new Set(dataSources.map((d) => d.id));

  const blocks: CraftBlock[] = Array.isArray(obj.blocks)
    ? (obj.blocks
        .map((b) => b as Record<string, unknown>)
        .map((b): CraftBlock | null => {
          const kind = String(b.kind);
          const title = typeof b.title === "string" ? b.title : "";
          if (kind === "text") {
            return { kind: "text", title, text: typeof b.text === "string" ? b.text : "" };
          }
          if (["stat", "table", "list", "source"].includes(kind) && sourceIds.has(String(b.source))) {
            return { kind: kind as "stat" | "table" | "list" | "source", title, source: String(b.source) };
          }
          return null;
        })
        .filter(Boolean) as CraftBlock[])
    : [];

  const actions: CraftAction[] = Array.isArray(obj.actions)
    ? obj.actions
        .map((a) => a as Record<string, unknown>)
        .filter((a) => knownTool(a.toolId))
        .map((a, i) => {
          const tool = provider.findTool(String(a.toolId))!;
          return {
            id: typeof a.id === "string" ? a.id : `act${i}`,
            label: typeof a.label === "string" ? a.label : tool.name,
            toolId: String(a.toolId),
            args: (a.args && typeof a.args === "object" ? a.args : {}) as Record<string, unknown>,
            sideEffect: tool.hasSideEffect,
          };
        })
    : [];

  const accent =
    typeof obj.accent === "string" && /^#[0-9a-f]{6}$/i.test(obj.accent)
      ? obj.accent
      : ACCENTS[Math.floor(Math.random() * ACCENTS.length)];

  return {
    title: typeof obj.title === "string" ? obj.title : "Generated app",
    summary: typeof obj.summary === "string" ? obj.summary : "",
    accent,
    dataSources,
    blocks: blocks.length > 0 ? blocks : dataSources.map((d) => ({ kind: "source" as const, title: d.label, source: d.id })),
    actions,
  };
}
