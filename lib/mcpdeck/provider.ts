import type { McpServerInfo, McpToolInfo, McpResourceNode } from "./types";
import {
  SERVERS as MOCK_SERVERS,
  TOOLS as MOCK_TOOLS,
  INITIAL_RESOURCES as MOCK_RESOURCES,
  expandResource as mockExpand,
} from "./catalogue";
import { runMockTool } from "./tool-runner";

/**
 * A provider is the source of MCP servers/tools/resources and the executor for
 * tool calls. The mock provider uses the built-in catalogue; the real provider
 * connects to live MCP servers via the SDK. Everything above this interface
 * (session, engine, UI) is provider-agnostic.
 */
export interface McpProvider {
  readonly kind: "mock" | "real";
  readonly servers: McpServerInfo[];
  readonly tools: McpToolInfo[];
  readonly initialResources: McpResourceNode[];
  findServer(id: string): McpServerInfo | undefined;
  findTool(id: string): McpToolInfo | undefined;
  callTool(toolId: string, args: Record<string, unknown>): Promise<{ result: string; isError: boolean }>;
  expandResource(nodeId: string): Promise<McpResourceNode[]>;
}

class MockProvider implements McpProvider {
  readonly kind = "mock" as const;
  readonly servers = MOCK_SERVERS;
  readonly tools = MOCK_TOOLS;
  readonly initialResources = MOCK_RESOURCES;
  findServer(id: string) {
    return this.servers.find((s) => s.id === id);
  }
  findTool(id: string) {
    return this.tools.find((t) => t.id === id);
  }
  callTool(toolId: string, args: Record<string, unknown>) {
    return runMockTool(toolId, args);
  }
  async expandResource(nodeId: string) {
    return mockExpand(nodeId);
  }
}

const MOCK = new MockProvider();

// Cache the resolved provider across HMR so we don't reconnect real servers
// on every request.
const PROVIDER_KEY = Symbol.for("mcpdeck.provider");
type GlobalWithProvider = typeof globalThis & {
  [PROVIDER_KEY]?: Promise<McpProvider>;
};
const g = globalThis as GlobalWithProvider;

export function getMcpProvider(): Promise<McpProvider> {
  if (g[PROVIDER_KEY]) return g[PROVIDER_KEY]!;
  g[PROVIDER_KEY] = resolveProvider();
  return g[PROVIDER_KEY]!;
}

async function resolveProvider(): Promise<McpProvider> {
  const raw = process.env.MCPDECK_SERVERS?.trim();
  if (!raw) return MOCK;
  try {
    // Lazy import so the SDK is only loaded when real servers are configured.
    const { buildRealProvider } = await import("./real-client");
    const real = await buildRealProvider(raw);
    // If no real server connected, fall back to mock so the demo still works.
    return real && real.servers.length > 0 ? real : MOCK;
  } catch (err) {
    console.error("[mcpdeck] real provider failed, falling back to mock:", err);
    return MOCK;
  }
}

export { MOCK as mockProvider };
