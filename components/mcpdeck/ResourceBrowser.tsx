"use client";

import { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, Folder, FileText, GitCommit, Inbox } from "lucide-react";
import type { McpResourceNode } from "@/lib/mcpdeck/types";

interface Props {
  nodes: McpResourceNode[];
  onExpand: (nodeId: string) => void;
}

export function ResourceBrowser({ nodes, onExpand }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const byParent = useMemo(() => {
    const m = new Map<string | null, McpResourceNode[]>();
    for (const n of nodes) {
      const k = n.parentId;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(n);
    }
    return m;
  }, [nodes]);

  const toggle = (node: McpResourceNode) => {
    if (!node.expandable) return;
    const next = new Set(open);
    if (next.has(node.id)) {
      next.delete(node.id);
    } else {
      next.add(node.id);
      // Lazy-load children if we haven't seen any yet.
      if (!byParent.has(node.id)) onExpand(node.id);
    }
    setOpen(next);
  };

  const roots = byParent.get(null) ?? [];

  return (
    <div className="space-y-2">
      <h3 className="text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--secondary)] px-0.5">
        Resources
      </h3>
      <div className="rounded border border-[var(--border)] bg-[var(--surface)] py-1.5">
        {roots.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            open={open}
            byParent={byParent}
            onToggle={toggle}
          />
        ))}
        {roots.length === 0 && (
          <div className="px-3 py-2 text-[11px] text-[var(--secondary)]">no resources</div>
        )}
      </div>
    </div>
  );
}

function TreeNode({
  node,
  depth,
  open,
  byParent,
  onToggle,
}: {
  node: McpResourceNode;
  depth: number;
  open: Set<string>;
  byParent: Map<string | null, McpResourceNode[]>;
  onToggle: (n: McpResourceNode) => void;
}) {
  const isOpen = open.has(node.id);
  const children = byParent.get(node.id) ?? [];
  const Icon = iconFor(node);

  return (
    <div>
      <button
        onClick={() => onToggle(node)}
        className="w-full flex items-center gap-1.5 px-2 py-1 hover:bg-[var(--surface-2)] text-left"
        style={{ paddingLeft: `${0.5 + depth * 0.8}rem` }}
      >
        {node.expandable ? (
          isOpen ? (
            <ChevronDown className="h-3 w-3 text-[var(--secondary)] shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-[var(--secondary)] shrink-0" />
          )
        ) : (
          <span className="w-3 inline-block" />
        )}
        <Icon className="h-3 w-3 text-[var(--secondary)] shrink-0" />
        <span className="text-[12px] truncate">{node.name}</span>
        {node.preview && (
          <span className="ml-auto font-mono text-[10px] text-[var(--secondary)] truncate">
            {node.preview}
          </span>
        )}
      </button>
      {isOpen &&
        children.map((c) => (
          <TreeNode
            key={c.id}
            node={c}
            depth={depth + 1}
            open={open}
            byParent={byParent}
            onToggle={onToggle}
          />
        ))}
    </div>
  );
}

function iconFor(node: McpResourceNode) {
  switch (node.kind) {
    case "folder":
      return Folder;
    case "file":
      return FileText;
    case "commit":
      return GitCommit;
    case "issue":
    case "record":
      return Inbox;
  }
}
