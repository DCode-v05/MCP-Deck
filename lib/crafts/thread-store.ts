import type { AgentMessage } from "@/lib/engine/tools";
import type { CraftBlock } from "./craft-block";

export interface Thread {
  id: string;
  messages: AgentMessage[];
  crafts: Map<string, CraftBlock>;
  createdAt: number;
  updatedAt: number;
}

const KEY = Symbol.for("crafts.threads");
type G = typeof globalThis & { [KEY]?: Map<string, Thread> };
const g = globalThis as G;
const THREADS: Map<string, Thread> = g[KEY] ?? (g[KEY] = new Map());

export function getOrCreateThread(threadId: string, nowMs: number): Thread {
  let t = THREADS.get(threadId);
  if (!t) {
    t = { id: threadId, messages: [], crafts: new Map(), createdAt: nowMs, updatedAt: nowMs };
    THREADS.set(threadId, t);
  }
  return t;
}

export function getThread(threadId: string): Thread | undefined {
  return THREADS.get(threadId);
}

export function appendMessages(threadId: string, msgs: AgentMessage[], nowMs: number): Thread {
  const t = getOrCreateThread(threadId, nowMs);
  t.messages.push(...msgs);
  t.updatedAt = nowMs;
  return t;
}

export function recordCraft(block: CraftBlock): void {
  const t = getOrCreateThread(block.thread_id, Date.parse(block.ts) || 0);
  t.crafts.set(block.payload.key, block);
  t.updatedAt = Date.parse(block.ts) || t.updatedAt;
}

export function getCraft(threadId: string, key: string): CraftBlock | undefined {
  return THREADS.get(threadId)?.crafts.get(key);
}

export function getCraftById(threadId: string, id: string): CraftBlock | undefined {
  const t = THREADS.get(threadId);
  if (!t) return undefined;
  for (const c of t.crafts.values()) if (c.id === id) return c;
  return undefined;
}

export function newThreadId(rand: string): string {
  return `thr_${rand}`;
}
