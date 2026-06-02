import type { McpProvider } from "./provider";
import type { CraftSpec } from "./craft";

const KEY = Symbol.for("mcpdeck.crafts");
type G = typeof globalThis & { [KEY]?: Map<string, CraftSession> };
const g = globalThis as G;
const CRAFTS: Map<string, CraftSession> = g[KEY] ?? (g[KEY] = new Map());

export function createCraftSession(spec: CraftSpec, provider: McpProvider): CraftSession {
  const id = `craft-${Math.random().toString(36).slice(2, 10)}`;
  const s = new CraftSession(id, spec, provider);
  CRAFTS.set(id, s);
  return s;
}
export function getCraftSession(id: string): CraftSession | undefined {
  return CRAFTS.get(id);
}

export class CraftSession {
  readonly id: string;
  readonly spec: CraftSpec;
  private provider: McpProvider;
  private allowed: Set<string>;

  constructor(id: string, spec: CraftSpec, provider: McpProvider) {
    this.id = id;
    this.spec = spec;
    this.provider = provider;
    // Only tools referenced by this generated craft may run — sandbox the session.
    this.allowed = new Set([
      ...spec.dataSources.map((d) => d.toolId),
      ...spec.actions.map((a) => a.toolId),
    ]);
  }

  async runTool(
    toolId: string,
    args: Record<string, unknown>,
  ): Promise<{ result: string; isError: boolean }> {
    if (!this.allowed.has(toolId)) {
      return { result: `Tool "${toolId}" is not part of this craft.`, isError: true };
    }
    return this.provider.callTool(toolId, args);
  }
}
