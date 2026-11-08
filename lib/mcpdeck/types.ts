import type { CraftBlock } from "@/lib/crafts/craft-block";

export type ServerHealth = "ok" | "degraded" | "down" | "disabled";

export interface McpServerInfo {
  id: string;
  name: string;
  description: string;
  toolIds: string[];
  resourceRoot: string;
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
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
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

export interface ServerUsage {
  serverId: string;
  requests: number;
  errors: number;
  bytes: number;
  lastActivityAt: number | null;
}

export interface UsageStats {
  plan: string;
  requestQuota: number;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  iterations: number;
  toolInvocations: number;
  approvals: number;
  denials: number;
  byServer: ServerUsage[];
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
  enabledServers: string[];
  pinnedTools: string[];
  openResources: string[];
  recentCalls: Array<{ toolId: string; isError: boolean; resultPreview: string | null }>;
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
