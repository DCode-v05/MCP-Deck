"use client";

import { Star, GitFork, Lock } from "lucide-react";
import { useServerDashboard, listStatus } from "@/lib/hooks/useServerDashboard";
import type { DashboardDef } from "@/lib/mcpdeck/apps/dashboards";
import { Card, EmptyState, ErrorState, LiveBadge, SectionLabel, Skeleton, relTime } from "./dashboard-kit";

interface Repo {
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  private: boolean;
  html_url: string;
}

/** github.search_repositories returns { total_count, items: Repo[] }. */
function extractRepos(payload: unknown): Repo[] | null {
  if (payload == null || typeof payload !== "object") return null;
  const items = (payload as { items?: unknown }).items;
  return Array.isArray(items) ? (items as Repo[]) : null;
}

export function GithubDashboard({ def }: { def: DashboardDef }) {
  const dash = useServerDashboard(def);
  const repos = listStatus(dash, "repos", extractRepos);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionLabel>Your repositories</SectionLabel>
        <LiveBadge connected={dash.connected} rev={repos.rev} />
      </div>

      {repos.status === "loading" && <Skeleton rows={4} />}
      {repos.status === "error" && <ErrorState message={repos.errorMessage ?? "unknown"} />}
      {repos.status === "empty" && (
        <EmptyState
          title="No repositories found"
          body="The token is connected, but the repository search returned nothing."
          footer="Connected · github.search_repositories returned 0 items."
        />
      )}
      {repos.status === "data" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(repos.items as Repo[]).slice(0, 50).map((r) => (
            <Card key={r.full_name} accent={def.accent}>
              <div className="flex items-center gap-1.5">
                {r.private && <Lock className="h-3 w-3 text-[var(--secondary)] shrink-0" />}
                <span className="font-medium text-[13px] truncate">{r.full_name}</span>
              </div>
              {r.description && (
                <p className="text-[11px] text-[var(--secondary)] leading-snug mt-1 line-clamp-2">{r.description}</p>
              )}
              <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-[var(--secondary)]">
                {r.language && <span>{r.language}</span>}
                <span className="inline-flex items-center gap-0.5"><Star className="h-3 w-3" />{r.stargazers_count}</span>
                <span className="inline-flex items-center gap-0.5"><GitFork className="h-3 w-3" />{r.forks_count}</span>
                <span>{relTime(r.updated_at)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
