"use client";

import type { McpServerInfo, McpServerState } from "@/lib/mcpdeck/types";

interface Props {
  catalogue: McpServerInfo[];
  state: Record<string, McpServerState>;
  onToggle: (serverId: string, enabled: boolean) => void;
}

export function ServerPanel({ catalogue, state, onToggle }: Props) {
  return (
    <div className="space-y-2">
      <h3 className="text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--secondary)] px-0.5">
        Servers
      </h3>
      <div className="space-y-px">
        {catalogue.map((info) => {
          const s = state[info.id];
          const enabled = s?.enabled ?? false;
          return (
            <div
              key={info.id}
              className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--surface-2)] transition-colors"
            >
              <HealthDot health={s?.health ?? "down"} />
              <span className="text-[13px] font-medium truncate flex-1 min-w-0">{info.name}</span>
              <span className="font-mono text-[10px] text-[var(--secondary)] tabular-nums">
                {info.toolIds.length}
              </span>
              <button
                onClick={() => onToggle(info.id, !enabled)}
                className={`text-[9px] uppercase tracking-[0.15em] font-mono w-9 text-center py-0.5 rounded transition-colors ${
                  enabled
                    ? "bg-accent/10 text-accent"
                    : "text-[var(--secondary)] opacity-0 group-hover:opacity-100 hover:bg-[var(--surface)]"
                }`}
              >
                {enabled ? "on" : "off"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HealthDot({ health }: { health: McpServerState["health"] }) {
  const color =
    health === "ok"
      ? "bg-emerald-500"
      : health === "degraded"
        ? "bg-amber-500"
        : health === "down"
          ? "bg-red-500"
          : "bg-[var(--border)]";
  return <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${color}`} aria-hidden />;
}
