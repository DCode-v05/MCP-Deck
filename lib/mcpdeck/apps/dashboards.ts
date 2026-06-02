/**
 * Apps-mode dashboard bindings. Each connected MCP server gets a read-only
 * dashboard whose live data flows through the EXISTING channel subsystem
 * (lib/channels/* + useChannel) — the channel polls getMcpProvider().callTool
 * for any non-"mock.*" op, so a real tool id like "github.search_repositories"
 * flows through the shared poll loop unchanged. No engine reasoning per tick.
 *
 * All tool ids here are REAL (probed live 2026-06-01). Read-only only — no
 * write tools are ever bound here.
 */
import type { ChannelBinding } from "@/lib/channels/wire";

export interface DashboardDef {
  /** matches McpServerInfo.id from the catalogue */
  serverId: string;
  label: string;
  /** lucide icon key (see DashboardIcon) */
  icon: string;
  accent: string;
  /** the channels this dashboard subscribes to (fan-in onto one SSE) */
  bindings: ChannelBinding[];
  /**
   * The "identity probe" alias — a channel that returns a real identity even
   * when the main list is empty. Used to tell "connected, finish setup" apart
   * from "not connected". (e.g. notion API-get-self, slack get_users.)
   */
  probeAs?: string;
  /** env var hint shown when the server is NOT connected */
  credHint?: string;
}

export const DASHBOARDS: DashboardDef[] = [
  {
    serverId: "github",
    label: "GitHub",
    icon: "git",
    accent: "#6e40c9",
    credHint: "GITHUB_PERSONAL_ACCESS_TOKEN",
    bindings: [
      { channel: "github.search_repositories", args: { query: "user:@me", perPage: 50 }, as: "repos", poll_s: 60 },
    ],
  },
  {
    serverId: "linear",
    label: "Linear",
    icon: "trending",
    accent: "#5E6AD2",
    credHint: "LINEAR_API_TOKEN",
    probeAs: "viewer",
    bindings: [
      { channel: "linear.linear_getViewer", args: {}, as: "viewer", poll_s: 120 },
      { channel: "linear.linear_getTeams", args: {}, as: "teams", poll_s: 120 },
      { channel: "linear.linear_getProjects", args: {}, as: "projects", poll_s: 60 },
    ],
  },
  {
    serverId: "notion",
    label: "Notion",
    icon: "pen",
    accent: "#0E8C7F",
    credHint: "NOTION_TOKEN",
    probeAs: "self",
    bindings: [
      { channel: "notion.API-get-self", args: {}, as: "self", poll_s: 300 },
      { channel: "notion.API-post-search", args: { query: "", page_size: 25 }, as: "search", poll_s: 60 },
    ],
  },
  {
    serverId: "slack",
    label: "Slack",
    icon: "mail",
    accent: "#C2487E",
    credHint: "SLACK_BOT_TOKEN + SLACK_TEAM_ID",
    probeAs: "users",
    bindings: [
      { channel: "slack.slack_get_users", args: { limit: 100 }, as: "users", poll_s: 300 },
      { channel: "slack.slack_list_channels", args: { limit: 200 }, as: "channels", poll_s: 60 },
    ],
  },
  {
    serverId: "fs",
    label: "Filesystem",
    icon: "table",
    accent: "#2E86C0",
    bindings: [
      { channel: "fs.list_directory", args: { path: "." }, as: "entries", poll_s: 20 },
    ],
  },
];

export function getDashboard(serverId: string): DashboardDef | undefined {
  return DASHBOARDS.find((d) => d.serverId === serverId);
}
