/**
 * Thread store — the missing piece the bidirectional plan's §6 route:engine
 * needs. A thread is a persistent server-side conversation (thread_id -> the
 * AgentMessage[] history + the crafts it has authored). A route:engine action
 * RESUMES this thread (it does not start a fresh run), so the engine has real
 * context — unlike branchFrom, which only flattened prior results into a string.
 *
 * In-memory + globalThis-hoisted (HMR-safe), like every other session store
 * here. Production would back this with Redis/Postgres.
 */
import type { AgentMessage } from "@/lib/engine/tools";
import type { CraftBlock } from "./craft-block";

export interface Thread {
  id: string;
  messages: AgentMessage[];
  /** crafts authored on this thread, by craft key (latest version per key) */
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

/** Store/replace a craft on its thread, keyed by craft key (for edits/versioning). */
export function recordCraft(block: CraftBlock): void {
  const t = getOrCreateThread(block.thread_id, Date.parse(block.ts) || 0);
  t.crafts.set(block.payload.key, block);
  t.updatedAt = Date.parse(block.ts) || t.updatedAt;
}

export function getCraft(threadId: string, key: string): CraftBlock | undefined {
  return THREADS.get(threadId)?.crafts.get(key);
}

/** Find a craft by its wire id across a thread (for block_input post-back). */
export function getCraftById(threadId: string, id: string): CraftBlock | undefined {
  const t = THREADS.get(threadId);
  if (!t) return undefined;
  for (const c of t.crafts.values()) if (c.id === id) return c;
  return undefined;
}

export function newThreadId(rand: string): string {
  return `thr_${rand}`;
}
