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

export type Route = "direct" | "engine";

export interface Subscribe {
  channel: string;
  args?: Record<string, unknown>;
  as: string;
  poll_s: number;
}

export interface CraftAction {
  name: string;
  route: Route;
  channel?: string;
  op?: string;
  args?: Record<string, unknown>;
  hasSideEffect?: boolean;
  label?: string;
  confirm?: string;
  idArg?: string;
  idFrom?: string;
  typeFrom?: string;
  _argsFinal?: boolean;
}

export interface CraftPayload {
  key: string;
  surface: Surface;
  format: CraftFormat;
  wait: boolean;
  language: string | null;
  title: string;
  content: string;
  version: number;
  subscribe: Subscribe[];
  actions: CraftAction[];
}

export interface CraftBlock {
  id: string;
  type: "craft";
  thread_id: string;
  ts: string;
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
  ts: string;
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

export function bumpCraftVersion(prev: CraftBlock, patch: Partial<CraftPayload>, ts: string): CraftBlock {
  return {
    ...prev,
    ts,
    payload: { ...prev.payload, ...patch, version: prev.payload.version + 1 },
  };
}

const FORBIDDEN_TAGS = /<\/?(script|iframe|object|embed|link|meta|style|form|base)\b[^>]*>/gi;
const EVENT_HANDLERS = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_URLS = /\b(href|src|action)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi;

export function sanitizeCraftHtml(html: string): string {
  return html
    .replace(FORBIDDEN_TAGS, "")
    .replace(EVENT_HANDLERS, "")
    .replace(JS_URLS, "");
}

export function slugKey(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 48) || "craft"
  );
}
