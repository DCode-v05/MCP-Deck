"use client";

import { useMemo, useState } from "react";
import type { McpServerInfo } from "@/lib/mcpdeck/types";
import { DASHBOARDS, type DashboardDef } from "@/lib/mcpdeck/apps/dashboards";
import { DashboardIcon, NotConnected } from "./dashboard-kit";
import { GithubDashboard } from "./GithubDashboard";
import { LinearDashboard } from "./LinearDashboard";
import { NotionDashboard } from "./NotionDashboard";
import { SlackDashboard } from "./SlackDashboard";

interface Props {
  /** from /api/mcpdeck/catalogue — the connected servers (real-client only lists what connected) */
  servers: McpServerInfo[];
  providerKind: "mock" | "real" | null;
}

const RENDERERS: Record<string, (def: DashboardDef) => React.ReactNode> = {
  github: (def) => <GithubDashboard def={def} />,
  linear: (def) => <LinearDashboard def={def} />,
  notion: (def) => <NotionDashboard def={def} />,
  slack: (def) => <SlackDashboard def={def} />,
};

export function AppsMode({ servers, providerKind }: Props) {
  // Connection is derived from the CATALOGUE, not the agent SSE (which is empty
  // until a goal runs). A dashboard is "connected" iff its server id is present.
  const connectedIds = useMemo(() => new Set(servers.map((s) => s.id)), [servers]);

  // Dashboards we have a renderer for, ordered: connected first.
  const tabs = useMemo(
    () =>
      DASHBOARDS.filter((d) => RENDERERS[d.serverId]).sort(
        (a, b) => Number(connectedIds.has(b.serverId)) - Number(connectedIds.has(a.serverId)),
      ),
    [connectedIds],
  );

  const [activeId, setActiveId] = useState<string>(() => {
    const firstConnected = DASHBOARDS.find((d) => RENDERERS[d.serverId] && true);
    return firstConnected?.serverId ?? "github";
  });
  const active = tabs.find((d) => d.serverId === activeId) ?? tabs[0];

  if (providerKind !== "real") {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-6 text-center space-y-2">
          <h2 className="font-display text-lg font-bold">Live app dashboards need real MCP servers</h2>
          <p className="text-[13px] text-[var(--secondary)] leading-relaxed">
            McpDeck is currently on the <strong>mock</strong> provider. Set <code className="text-accent">MCPDECK_SERVERS</code>{" "}
            in <code>.env</code> with real GitHub / Notion / Linear / Slack servers and restart to see live, read-only
            dashboards here — each bound to real tools through the shared channel poll loop.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Server switcher */}
      <div className="border-b border-[var(--border)] px-4 py-2 flex items-center gap-1 overflow-x-auto">
        {tabs.map((d) => {
          const connected = connectedIds.has(d.serverId);
          const isActive = active?.serverId === d.serverId;
          return (
            <button
              key={d.serverId}
              onClick={() => setActiveId(d.serverId)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap transition-colors border ${
                isActive ? "border-accent/40 bg-accent/10 text-accent" : "border-transparent text-[var(--secondary)] hover:text-[var(--foreground)]"
              }`}
              style={isActive ? { color: d.accent, borderColor: `${d.accent}55`, background: `${d.accent}10` } : undefined}
            >
              <DashboardIcon name={d.icon} className="h-3.5 w-3.5" />
              {d.label}
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-[var(--border)]"}`} />
            </button>
          );
        })}
      </div>

      {/* Active dashboard */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-5">
          {!active ? (
            <p className="text-[13px] text-[var(--secondary)]">No dashboards available.</p>
          ) : !connectedIds.has(active.serverId) ? (
            <NotConnected label={active.label} credHint={active.credHint} />
          ) : (
            RENDERERS[active.serverId](active)
          )}
        </div>
      </div>
    </div>
  );
}
