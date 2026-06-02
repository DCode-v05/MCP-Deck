"use client";

import { useServerDashboard, listStatus } from "@/lib/hooks/useServerDashboard";
import type { DashboardDef } from "@/lib/mcpdeck/apps/dashboards";
import { Card, EmptyState, ErrorState, LiveBadge, SectionLabel, Skeleton } from "./dashboard-kit";

interface Viewer { name?: string; email?: string; displayName?: string; }
interface Team { id: string; name: string; key: string; }
interface Project { id: string; name: string; state?: string; progress?: number; }

/** Linear tools return either an array directly or {nodes:[...]}; tolerate both. */
function asArray<T>(payload: unknown): T[] | null {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    const nodes = (payload as { nodes?: unknown }).nodes;
    if (Array.isArray(nodes)) return nodes as T[];
  }
  return null;
}

export function LinearDashboard({ def }: { def: DashboardDef }) {
  const dash = useServerDashboard(def);
  const viewer = dash.data.viewer as Viewer | undefined;
  const teams = listStatus(dash, "teams", (p) => asArray<Team>(p));
  const projects = listStatus(dash, "projects", (p) => asArray<Project>(p));

  return (
    <div className="space-y-4">
      {/* Identity header */}
      <div className="rounded-xl border p-4 flex items-center justify-between" style={{ background: `${def.accent}0D`, borderColor: `${def.accent}33` }}>
        <div className="flex items-center gap-3">
          <span className="h-9 w-9 rounded-lg flex items-center justify-center font-display font-bold" style={{ background: `${def.accent}1A`, color: def.accent }}>
            {(viewer?.name ?? "?").charAt(0)}
          </span>
          <div>
            <div className="font-medium text-[14px]">{viewer?.name ?? (dash.connected ? "Loading…" : "Connecting…")}</div>
            {viewer?.email && <div className="text-[11px] text-[var(--secondary)] font-mono">{viewer.email}</div>}
          </div>
        </div>
        <LiveBadge connected={dash.connected} rev={dash.rev.viewer ?? 0} />
      </div>

      {/* Teams */}
      <div>
        <SectionLabel>Teams</SectionLabel>
        {teams.status === "loading" && <Skeleton rows={1} />}
        {teams.status === "error" && <ErrorState message={teams.errorMessage ?? "unknown"} />}
        {teams.status === "empty" && <p className="text-[12px] text-[var(--secondary)]">No teams.</p>}
        {teams.status === "data" && (
          <div className="flex flex-wrap gap-1.5">
            {(teams.items as Team[]).map((t) => (
              <span key={t.id} className="text-[12px] font-mono px-2.5 py-1 rounded-full border" style={{ borderColor: `${def.accent}55`, color: def.accent, background: `${def.accent}10` }}>
                {t.key} · {t.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Projects */}
      <div>
        <div className="flex items-center justify-between">
          <SectionLabel>Projects</SectionLabel>
          <LiveBadge connected={dash.connected} rev={projects.rev} />
        </div>
        {projects.status === "loading" && <Skeleton rows={2} />}
        {projects.status === "error" && <ErrorState message={projects.errorMessage ?? "unknown"} />}
        {projects.status === "empty" && (
          <EmptyState
            title="No projects yet"
            body="Connected to Linear, but this workspace has no projects."
            footer="Connected · linear_getProjects returned 0 items."
          />
        )}
        {projects.status === "data" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(projects.items as Project[]).map((p) => (
              <Card key={p.id} accent={def.accent}>
                <div className="font-medium text-[13px] truncate">{p.name}</div>
                <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-[var(--secondary)]">
                  {p.state && <span>{p.state}</span>}
                  {typeof p.progress === "number" && <span>{Math.round(p.progress * 100)}%</span>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
