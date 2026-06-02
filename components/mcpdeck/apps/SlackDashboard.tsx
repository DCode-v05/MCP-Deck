"use client";

import { Hash, Lock, Users } from "lucide-react";
import { useServerDashboard, listStatus } from "@/lib/hooks/useServerDashboard";
import type { DashboardDef } from "@/lib/mcpdeck/apps/dashboards";
import { Card, EmptyState, ErrorState, LiveBadge, SectionLabel, Skeleton } from "./dashboard-kit";

interface SlackChannel {
  id: string;
  name: string;
  is_private?: boolean;
  num_members?: number;
}

/** slack.slack_list_channels returns { ok, channels: [...] }. */
function extractChannels(payload: unknown): SlackChannel[] | null {
  if (payload == null || typeof payload !== "object") return null;
  const ch = (payload as { channels?: unknown }).channels;
  return Array.isArray(ch) ? (ch as SlackChannel[]) : null;
}

function memberCount(payload: unknown): number | null {
  if (payload == null || typeof payload !== "object") return null;
  const members = (payload as { members?: unknown }).members;
  return Array.isArray(members) ? members.length : null;
}

export function SlackDashboard({ def }: { def: DashboardDef }) {
  const dash = useServerDashboard(def);
  const channels = listStatus(dash, "channels", extractChannels);
  const members = memberCount(dash.data.users);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionLabel>Channels</SectionLabel>
        <div className="flex items-center gap-2">
          {members != null && (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-[var(--secondary)]">
              <Users className="h-3 w-3" />{members} members
            </span>
          )}
          <LiveBadge connected={dash.connected} rev={channels.rev} />
        </div>
      </div>

      {channels.status === "loading" && <Skeleton rows={3} />}
      {channels.status === "error" && <ErrorState message={channels.errorMessage ?? "unknown"} />}
      {channels.status === "empty" && (
        <EmptyState
          title="The bot isn't in any channels yet"
          body="McpDeck is connected to your Slack workspace, but Slack only returns channels the bot has been invited to."
          steps={[
            "Open a Slack channel",
            "Type /invite @YourApp",
            "It appears here within ~60s — this view auto-refreshes.",
          ]}
          footer="Connected · slack_list_channels returned 0 channels. Heads-up: SLACK_CHANNEL_IDS in .env looks malformed — channel ids start with C…, not A0B… (that's an app id)."
        />
      )}
      {channels.status === "data" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(channels.items as SlackChannel[]).map((c) => (
            <Card key={c.id} accent={def.accent}>
              <div className="flex items-center gap-1.5">
                {c.is_private ? <Lock className="h-3 w-3 text-[var(--secondary)]" /> : <Hash className="h-3 w-3 text-[var(--secondary)]" />}
                <span className="text-[13px] font-medium truncate">{c.name}</span>
                {c.num_members != null && <span className="ml-auto text-[10px] font-mono text-[var(--secondary)]">{c.num_members}</span>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
