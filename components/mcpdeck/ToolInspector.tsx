"use client";

import { useMemo, useState } from "react";
import { Pin, PinOff, Search } from "lucide-react";
import type { McpToolInfo, McpToolState } from "@/lib/mcpdeck/types";

interface Props {
  catalogue: McpToolInfo[];
  state: Record<string, McpToolState>;
  enabledServerIds: Set<string>;
  onPin: (toolId: string, pinned: boolean) => void;
}

export function ToolInspector({ catalogue, state, enabledServerIds, onPin }: Props) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return catalogue.filter((t) => !needle || t.id.toLowerCase().includes(needle));
  }, [catalogue, q]);

  // Pinned + used tools float to the top; the long tail stays searchable below.
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const pa = state[a.id]?.pinned ? 1 : 0;
      const pb = state[b.id]?.pinned ? 1 : 0;
      if (pa !== pb) return pb - pa;
      const ia = state[a.id]?.invocationCount ?? 0;
      const ib = state[b.id]?.invocationCount ?? 0;
      return ib - ia;
    });
  }, [filtered, state]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-0.5">
        <h3 className="text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--secondary)]">
          Tools
        </h3>
        <span className="font-mono text-[10px] text-[var(--secondary)] tabular-nums">
          {filtered.length}
        </span>
      </div>

      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--secondary)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter tools…"
          className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] pl-7 pr-2 py-1 text-[12px] focus:outline-none focus:border-accent/50"
        />
      </div>

      <div className="space-y-px">
        {sorted.map((tool) => {
          const enabled = enabledServerIds.has(tool.serverId);
          const t = state[tool.id];
          const pinned = t?.pinned ?? false;
          const shortName = tool.id.includes(".") ? tool.id.slice(tool.id.indexOf(".") + 1) : tool.id;
          return (
            <div
              key={tool.id}
              title={tool.description}
              className={`group flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors ${
                enabled ? "opacity-100" : "opacity-40"
              } ${pinned ? "bg-accent/5" : "hover:bg-[var(--surface-2)]"}`}
            >
              <button
                onClick={() => onPin(tool.id, !pinned)}
                className={`shrink-0 ${pinned ? "text-accent" : "text-[var(--secondary)] opacity-0 group-hover:opacity-100"} hover:text-accent`}
                title={pinned ? "unpin" : "pin (bias engine toward this tool)"}
              >
                {pinned ? <Pin className="h-3 w-3 fill-current" /> : <PinOff className="h-3 w-3" />}
              </button>
              <span className="font-mono text-[11px] truncate flex-1 min-w-0">{shortName}</span>
              {tool.hasSideEffect && (
                <span
                  className="shrink-0 h-1.5 w-1.5 rounded-full bg-amber-500"
                  title="side-effect — performs a real action"
                />
              )}
              {t && t.invocationCount > 0 && (
                <span className="shrink-0 font-mono text-[9px] text-[var(--secondary)] tabular-nums">
                  {t.invocationCount}×
                </span>
              )}
            </div>
          );
        })}
        {sorted.length === 0 && (
          <p className="text-[11px] text-[var(--secondary)] px-2 py-3 text-center">No tools match.</p>
        )}
      </div>
    </div>
  );
}
