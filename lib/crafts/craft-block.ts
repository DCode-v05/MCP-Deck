/**
 * The craft block — the single envelope for ALL engine-authored UI
 * (bidirectional-engine-plan §1–5). The engine authors a <craft> tag; a parser
 * turns it into this block; the product renders/stores/runs it.
 *
 * Client+server safe: pure types + helpers, NO React, NO provider SDK imports
 * (it sits beside server-only authoring code, so a stray import here would drag
 * node-only deps into the client bundle).
 */

// ── §2 the three axes ──
export type Surface = "inline" | "panel";
export type CraftFormat = "html" | "markdown" | "code" | "svg";

export const SURFACES: Surface[] = ["inline", "panel"];
export const FORMATS: CraftFormat[] = ["html", "markdown", "code", "svg"];
export function isSurface(v: unknown): v is Surface {
  return typeof v === "string" && (SURFACES as string[]).includes(v);
}
export function isFormat(v: unknown): v is CraftFormat {
  return typeof v === "string" && (FORMATS as string[]).includes(v);
}

// ── §7 live craft fields ──
export type Route = "direct" | "engine";

/** A channel the craft subscribes to (data IN). */
export interface Subscribe {
  channel: string; // a real tool id, e.g. "github.search_repositories"
  args?: Record<string, unknown>;
  as: string; // craft-local alias the markup binds to via data-craft-bind="<as>"
  poll_s: number;
}

/** An authored action (data OUT). Routing is STAMPED at authoring time (§6). */
export interface CraftAction {
  name: string; // referenced by data-craft-emit="<name>"
  route: Route; // "direct" = channel call, no engine · "engine" = resume thread
  channel?: string; // route:direct -> which channel/tool op to call (a SUBSCRIBED channel)
  op?: string; // the tool id to invoke (the WRITE tool, may differ from channel)
  args?: Record<string, unknown>;
  hasSideEffect?: boolean; // a WRITE -> the renderer forces an approval gate
  label?: string;
  confirm?: string; // human-readable confirm text for the approval modal
  // ── per-row editable lists (data-craft-each) — the row id is late-bound ──
  /** arg path the captured per-row id is injected at, e.g. "block_id" | "id" | "issue_number" */
  idArg?: string;
  /** dot path to the row's own id field (default "id"; e.g. "number" for GitHub) */
  idFrom?: string;
  /** dot path to the row's type, for the Notion update body-key {type} splice (e.g. "type") */
  typeFrom?: string;
  /** runtime-only: set by the renderer when args are already fully assembled (per-row write). */
  _argsFinal?: boolean;
}

export interface CraftPayload {
  key: string; // engine's stable kebab id; same across versions
  surface: Surface;
  format: CraftFormat;
  wait: boolean; // does the stream pause for the user?
  language: string | null; // only when format === "code"
  title: string;
  content: string; // the authored markup (appends while streaming)
  version: number; // starts at 1; +1 per edit of same key
  subscribe: Subscribe[]; // live data IN
  actions: CraftAction[]; // actions OUT (route-stamped)
}

export interface CraftBlock {
  id: string; // wire identity — for updates & post-back
  type: "craft";
  thread_id: string;
  ts: string; // ISO-8601
  payload: CraftPayload;
}

export interface NewCraftArgs {
  id: string;
  thread_id: string;
  surface: Surface;
  format: CraftFormat;
  wait?: boolean;
  key: string;
  title: string;
  language?: string | null;
  content: string;
  subscribe?: Subscribe[];
  actions?: CraftAction[];
  ts: string; // caller stamps (no Date.now in shared code)
}

export function newCraftBlock(a: NewCraftArgs): CraftBlock {
  return {
    id: a.id,
    type: "craft",
    thread_id: a.thread_id,
    ts: a.ts,
    payload: {
      key: a.key,
      surface: a.surface,
      format: a.format,
      wait: a.wait ?? false,
      language: a.language ?? null,
      title: a.title,
      content: a.content,
      version: 1,
      subscribe: a.subscribe ?? [],
      actions: a.actions ?? [],
    },
  };
}

/** §9–10: an edit re-authors the same key -> same id, version+1. */
export function bumpCraftVersion(prev: CraftBlock, patch: Partial<CraftPayload>, ts: string): CraftBlock {
  return {
    ...prev,
    ts,
    payload: { ...prev.payload, ...patch, version: prev.payload.version + 1 },
  };
}

// ── sanitizer (server-safe, no DOM) ──
// The craft content is OUR engine's output, but we still strip anything that
// could execute or escape: scripts, event handlers, iframes, javascript: urls.
// The renderer keeps interactivity through data-craft-* attributes only.
const FORBIDDEN_TAGS = /<\/?(script|iframe|object|embed|link|meta|style|form|base)\b[^>]*>/gi;
const EVENT_HANDLERS = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_URLS = /\b(href|src|action)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi;

export function sanitizeCraftHtml(html: string): string {
  return html
    .replace(FORBIDDEN_TAGS, "")
    .replace(EVENT_HANDLERS, "")
    .replace(JS_URLS, "");
}

/** Slugify a title into a stable kebab key when the engine omits one. */
export function slugKey(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 48) || "craft"
  );
}
