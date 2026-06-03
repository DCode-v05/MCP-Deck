import type { McpServerInfo, McpToolInfo, McpResourceNode } from "./types";

export const SERVERS: McpServerInfo[] = [
  {
    id: "git",
    name: "Git",
    description: "Repository inspection: status, log, diff, branch.",
    toolIds: ["git.status", "git.log", "git.diff", "git.branch"],
    resourceRoot: "git:/",
    latencyMs: 42,
  },
  {
    id: "linear",
    name: "Linear",
    description: "Issue tracker. List, read, create, comment.",
    toolIds: ["linear.list_issues", "linear.read_issue", "linear.create_issue", "linear.comment"],
    resourceRoot: "linear:/",
    latencyMs: 156,
  },
];

export const TOOLS: McpToolInfo[] = [
  {
    id: "git.status",
    serverId: "git",
    name: "git.status",
    description: "Working tree status.",
    inputSchema: { type: "object", properties: {} },
    hasSideEffect: false,
  },
  {
    id: "git.log",
    serverId: "git",
    name: "git.log",
    description: "Recent commits.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number", description: "Max commits to return." } },
    },
    hasSideEffect: false,
  },
  {
    id: "git.diff",
    serverId: "git",
    name: "git.diff",
    description: "Unified diff of working tree against HEAD.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Optional path filter." } },
    },
    hasSideEffect: false,
  },
  {
    id: "git.branch",
    serverId: "git",
    name: "git.branch",
    description: "List or create a branch.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "create"] },
        name: { type: "string", description: "Required when action=create." },
      },
      required: ["action"],
    },
    hasSideEffect: true,
  },
  {
    id: "linear.list_issues",
    serverId: "linear",
    name: "linear.list_issues",
    description: "List issues by status.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["todo", "in_progress", "done"] },
        limit: { type: "number" },
      },
    },
    hasSideEffect: false,
  },
  {
    id: "linear.read_issue",
    serverId: "linear",
    name: "linear.read_issue",
    description: "Read a single issue.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "e.g. ENG-204" } },
      required: ["id"],
    },
    hasSideEffect: false,
  },
  {
    id: "linear.create_issue",
    serverId: "linear",
    name: "linear.create_issue",
    description: "Create a new issue.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        team: { type: "string", enum: ["ENG", "DESIGN", "OPS"] },
      },
      required: ["title", "team"],
    },
    hasSideEffect: true,
  },
  {
    id: "linear.comment",
    serverId: "linear",
    name: "linear.comment",
    description: "Add a comment to an issue.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        body: { type: "string" },
      },
      required: ["id", "body"],
    },
    hasSideEffect: true,
  },
];

export const INITIAL_RESOURCES: McpResourceNode[] = [
  { id: "git:/", serverId: "git", parentId: null, name: "Repository", kind: "folder", preview: null, expandable: true },
  { id: "linear:/", serverId: "linear", parentId: null, name: "Linear", kind: "folder", preview: null, expandable: true },
];

export function expandResource(nodeId: string): McpResourceNode[] {
  switch (nodeId) {
    case "git:/":
      return [
        { id: "git:/main", serverId: "git", parentId: "git:/", name: "main", kind: "folder", preview: "current branch", expandable: true },
        { id: "git:/origin", serverId: "git", parentId: "git:/", name: "origin/main", kind: "folder", preview: "12 commits ahead", expandable: true },
      ];
    case "git:/main":
      return [
        { id: "git:/main/a1b2c3", serverId: "git", parentId: "git:/main", name: "a1b2c3 · fix: race in approval queue", kind: "commit", preview: "2h ago · alice", expandable: false },
        { id: "git:/main/d4e5f6", serverId: "git", parentId: "git:/main", name: "d4e5f6 · feat: bidirectional UI primitives", kind: "commit", preview: "4h ago · bob", expandable: false },
      ];
    case "linear:/":
      return [
        { id: "linear:/todo", serverId: "linear", parentId: "linear:/", name: "Todo (8)", kind: "folder", preview: null, expandable: true },
        { id: "linear:/in_progress", serverId: "linear", parentId: "linear:/", name: "In Progress (3)", kind: "folder", preview: null, expandable: true },
        { id: "linear:/done", serverId: "linear", parentId: "linear:/", name: "Done (24)", kind: "folder", preview: null, expandable: true },
      ];
    case "linear:/todo":
      return [
        { id: "linear:/issue/ENG-204", serverId: "linear", parentId: "linear:/todo", name: "ENG-204 · pause-on-approval primitive", kind: "issue", preview: "P1 · @alice", expandable: false },
        { id: "linear:/issue/ENG-211", serverId: "linear", parentId: "linear:/todo", name: "ENG-211 · server-push widget patch", kind: "issue", preview: "P2 · unassigned", expandable: false },
      ];
    case "linear:/in_progress":
      return [
        { id: "linear:/issue/ENG-198", serverId: "linear", parentId: "linear:/in_progress", name: "ENG-198 · McpDeck UI surfaces", kind: "issue", preview: "P0 · @bob", expandable: false },
      ];
    default:
      return [];
  }
}

export function findServer(id: string): McpServerInfo | undefined {
  return SERVERS.find((s) => s.id === id);
}
export function findTool(id: string): McpToolInfo | undefined {
  return TOOLS.find((t) => t.id === id);
}
