/**
 * McpDeck protocol types. The session is the unit of bidirectional state:
 * one long-lived SSE stream out, one POST endpoint in, both keyed by sessionId.
 */
import type { CraftBlock } from "@/lib/crafts/craft-block";

export type ServerHealth = "ok" | "degraded" | "down" | "disabled";

export interface McpServerInfo {
  id: string;
  name: string;
  description: string;
  toolIds: string[];
  resourceRoot: string;
  /** simulated round-trip latency in ms */
  latencyMs: number;
}

export interface McpServerState {
  id: string;
  enabled: boolean;
  health: ServerHealth;
  lastPingAt: number;
  latencyMs: number;
}

export interface McpToolInfo {
  id: string;
  serverId: string;
  name: string;
  description: string;
  /** input schema (JSON Schema fragment) */
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
  /** if true, this tool has a real side effect (write, send, charge) */
  hasSideEffect: boolean;
}

export interface McpToolState {
  id: string;
  pinned: boolean;
  invocationCount: number;
  lastInvokedAt: number | null;
  lastResultPreview: string | null;
  lastIsError: boolean;
}

export interface McpResourceNode {
  id: string;
  serverId: string;
  parentId: string | null;
  name: string;
  kind: "folder" | "file" | "issue" | "commit" | "record";
  /** when null and !expanded, the engine will lazy-load on expand */
  preview: string | null;
  expandable: boolean;
}

export interface ReplayEntry {
  id: string;
  iteration: number;
  serverId: string;
  toolId: string;
  args: Record<string, unknown>;
  argsEdited: boolean;
  verdict: "approved" | "denied" | "auto";
  result: string | null;
  isError: boolean;
  startedAt: number;
  completedAt: number | null;
}

export type ApprovalVerdict =
  | { kind: "approve"; args: Record<string, unknown> }
  | { kind: "approve_remember"; args: Record<string, unknown> }
  | { kind: "deny"; reason?: string };

/** Per-server usage, the way a subscription/billing dashboard would show it. */
export interface ServerUsage {
  serverId: string;
  requests: number;
  errors: number;
  /** approximate bytes of result payloads returned by this server */
  bytes: number;
  lastActivityAt: number | null;
}

/** Whole-session usage rolled up for the Subscription tab. */
export interface UsageStats {
  /** subscription framing */
  plan: string;
  requestQuota: number;
  /** engine reasoning cost */
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  iterations: number;
  /** tool activity */
  toolInvocations: number;
  approvals: number;
  denials: number;
  /** per-server breakdown */
  byServer: ServerUsage[];
  /** session timing */
  startedAt: number;
  updatedAt: number;
}

export interface PendingApproval {
  requestId: string;
  serverId: string;
  toolId: string;
  args: Record<string, unknown>;
  createdAt: number;
}

export interface EngineThought {
  iteration: number;
  /** Servers currently enabled at the moment of the read. */
  enabledServers: string[];
  /** Tools pinned at the moment of the read. */
  pinnedTools: string[];
  /** Resource nodes the user has expanded. */
  openResources: string[];
  /** Most recent tool calls the engine is conditioning on. */
  recentCalls: Array<{ toolId: string; isError: boolean; resultPreview: string | null }>;
  /** Plain-language sentence describing what the engine is about to do. */
  intent: string;
}

export type McpDeckEvent =
  | { type: "session_ready"; sessionId: string }
  | { type: "log"; level: "info" | "warn" | "error"; message: string }
  | { type: "server_state"; state: McpServerState }
  | { type: "tool_state"; state: McpToolState }
  | { type: "resource_tree"; nodes: McpResourceNode[] }
  | { type: "approval_pending"; pending: PendingApproval }
  | { type: "approval_resolved"; requestId: string; verdict: ApprovalVerdict }
  | { type: "tool_started"; replayId: string; iteration: number; serverId: string; toolId: string; args: Record<string, unknown> }
  | { type: "tool_completed"; replayId: string; result: string; isError: boolean }
  | { type: "engine_text"; text: string }
  | { type: "engine_iteration"; iteration: number; goal: string }
  | { type: "engine_thought"; thought: EngineThought }
  | { type: "engine_done"; reason: "completed" | "stopped" | "error"; summary: string | null }
  | { type: "craft"; block: CraftBlock }
  | { type: "usage"; inputTokens: number; outputTokens: number; totalCost: number }
  | { type: "usage_state"; usage: UsageStats }
  | { type: "error"; message: string };

export type UpstreamMessage =
  | { kind: "approval"; requestId: string; verdict: ApprovalVerdict }
  | { kind: "toggle_server"; serverId: string; enabled: boolean }
  | { kind: "pin_tool"; toolId: string; pinned: boolean }
  | { kind: "expand_resource"; nodeId: string }
  | { kind: "replay"; replayId: string; editedArgs?: Record<string, unknown> }
  | { kind: "branch"; replayId: string; newGoal: string }
  | { kind: "stop" };

export interface SessionSnapshot {
  sessionId: string;
  goal: string | null;
  status: "idle" | "running" | "awaiting_input" | "completed" | "error";
  servers: McpServerState[];
  tools: McpToolState[];
  resources: McpResourceNode[];
  replay: ReplayEntry[];
  pendingApprovals: PendingApproval[];
  log: Array<{ level: "info" | "warn" | "error"; message: string; ts: number }>;
  usage: UsageStats;
}
