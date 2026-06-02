"use client";

import { FileText } from "lucide-react";
import { useServerDashboard, listStatus } from "@/lib/hooks/useServerDashboard";
import type { DashboardDef } from "@/lib/mcpdeck/apps/dashboards";
import { Card, EmptyState, ErrorState, LiveBadge, SectionLabel, Skeleton, relTime } from "./dashboard-kit";

interface NotionItem {
  id: string;
  object: string;
  url?: string;
  last_edited_time?: string;
  properties?: Record<string, unknown>;
}

/** notion.API-post-search returns { results: [...] }. */
function extractResults(payload: unknown): NotionItem[] | null {
  if (payload == null || typeof payload !== "object") return null;
  const results = (payload as { results?: unknown }).results;
  return Array.isArray(results) ? (results as NotionItem[]) : null;
}

function titleOf(item: NotionItem): string {
  // Notion page titles live in properties.<Name>.title[].plain_text — best effort.
  const props = item.properties ?? {};
  for (const v of Object.values(props)) {
    const t = (v as { title?: Array<{ plain_text?: string }> })?.title;
    if (Array.isArray(t) && t[0]?.plain_text) return t[0].plain_text;
  }
  if (item.url) return decodeURIComponent(item.url.split("/").pop() ?? item.id).replace(/-[0-9a-f]{32}$/i, "").replace(/-/g, " ");
  return item.object === "data_source" ? "Database" : "Untitled";
}

export function NotionDashboard({ def }: { def: DashboardDef }) {
  const dash = useServerDashboard(def);
  const self = dash.data.self as { name?: string; bot?: { owner?: unknown } } | undefined;
  const search = listStatus(dash, "search", extractResults);
  const connectedAs = self?.name ?? "your workspace";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionLabel>Shared pages &amp; databases</SectionLabel>
        <LiveBadge connected={dash.connected} rev={search.rev} />
      </div>

      {search.status === "loading" && <Skeleton rows={3} />}
      {search.status === "error" && <ErrorState message={search.errorMessage ?? "unknown"} />}
      {search.status === "empty" && (
        <EmptyState
          title="No pages shared with this integration yet"
          body={`McpDeck is connected to Notion as "${connectedAs}", but the integration can only see pages you explicitly share with it.`}
          steps={[
            "Open a page (or database) in Notion",
            "Click ••• (top-right) → Connections → add your integration",
            "It appears here within ~60s — this view auto-refreshes.",
          ]}
          footer="Connected · API-post-search returned 0 results."
        />
      )}
      {search.status === "data" && (
        <div className="space-y-1.5">
          {(search.items as NotionItem[]).map((item) => (
            <Card key={item.id} accent={def.accent}>
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-[var(--secondary)] shrink-0" />
                <span className="text-[13px] truncate">{titleOf(item)}</span>
                <span className="ml-auto text-[10px] font-mono text-[var(--secondary)]">{relTime(item.last_edited_time)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
