import { isFormat, isSurface, slugKey, type CraftFormat, type Surface } from "./craft-block";

export type ParserEvent =
  | { type: "text"; delta: string }
  | { type: "craft_open"; attrs: OpenAttrs }
  | { type: "craft_append"; delta: string }
  | { type: "craft_close" }
  | { type: "craft_live"; json: string };

export interface OpenAttrs {
  surface: Surface;
  format: CraftFormat;
  wait: boolean;
  key: string;
  title: string;
  language: string | null;
}

type State = "outside" | "in_content" | "in_live";

const OPEN = "<craft";
const CLOSE = "</craft>";
const LIVE_OPEN = "<craft-live>";
const LIVE_CLOSE = "</craft-live>";

export class CraftStreamParser {
  private state: State = "outside";
  private buf = "";
  private live = "";

  push(delta: string): ParserEvent[] {
    this.buf += delta;
    const out: ParserEvent[] = [];
    let progressed = true;
    while (progressed) {
      progressed = false;
      if (this.state === "outside") progressed = this.stepOutside(out);
      else if (this.state === "in_content") progressed = this.stepContent(out);
      else if (this.state === "in_live") progressed = this.stepLive(out);
    }
    return out;
  }

  end(): ParserEvent[] {
    const out: ParserEvent[] = [];
    if (this.state === "outside" && this.buf && !couldStartToken(this.buf, OPEN)) {
      out.push({ type: "text", delta: this.buf });
      this.buf = "";
    }
    if (this.state === "in_content" && this.buf && !couldStartToken(this.buf, CLOSE)) {
      out.push({ type: "craft_append", delta: this.buf });
      this.buf = "";
    }
    return out;
  }

  private stepOutside(out: ParserEvent[]): boolean {
    const idx = this.buf.indexOf(OPEN);
    if (idx === -1) {
      const safe = safePrefix(this.buf, OPEN);
      if (safe > 0) {
        out.push({ type: "text", delta: this.buf.slice(0, safe) });
        this.buf = this.buf.slice(safe);
      }
      return false;
    }
    if (idx > 0) {
      out.push({ type: "text", delta: this.buf.slice(0, idx) });
      this.buf = this.buf.slice(idx);
    }
    const gt = findTagEnd(this.buf);
    if (gt === -1) return false;
    const rawTag = this.buf.slice(0, gt + 1);
    this.buf = this.buf.slice(gt + 1);
    out.push({ type: "craft_open", attrs: parseCraftAttrs(rawTag) });
    this.state = "in_content";
    return true;
  }

  private stepContent(out: ParserEvent[]): boolean {
    const idx = this.buf.indexOf(CLOSE);
    if (idx === -1) {
      const safe = safePrefix(this.buf, CLOSE);
      if (safe > 0) {
        out.push({ type: "craft_append", delta: this.buf.slice(0, safe) });
        this.buf = this.buf.slice(safe);
      }
      return false;
    }
    if (idx > 0) out.push({ type: "craft_append", delta: this.buf.slice(0, idx) });
    this.buf = this.buf.slice(idx + CLOSE.length);
    out.push({ type: "craft_close" });
    this.state = "in_live";
    return true;
  }

  private stepLive(out: ParserEvent[]): boolean {
    const openIdx = this.buf.indexOf(LIVE_OPEN);
    if (openIdx === -1) {
      const trimmed = this.buf.replace(/^\s+/, "");
      if (trimmed.length === 0) return false;
      if (LIVE_OPEN.startsWith(trimmed.slice(0, LIVE_OPEN.length))) return false;
      this.state = "outside";
      return true;
    }
    const closeIdx = this.buf.indexOf(LIVE_CLOSE, openIdx + LIVE_OPEN.length);
    if (closeIdx === -1) return false;
    this.live = this.buf.slice(openIdx + LIVE_OPEN.length, closeIdx);
    this.buf = this.buf.slice(closeIdx + LIVE_CLOSE.length);
    out.push({ type: "craft_live", json: this.live.trim() });
    this.state = "outside";
    return true;
  }
}

export function parseCraftAttrs(rawTag: string): OpenAttrs {
  const get = (name: string): string | null => {
    const m = rawTag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"));
    return m ? m[1] : null;
  };
  const surfaceRaw = get("surface");
  const formatRaw = get("format");
  const title = get("title") ?? "Untitled";
  return {
    surface: isSurface(surfaceRaw) ? surfaceRaw : "inline",
    format: isFormat(formatRaw) ? formatRaw : "html",
    wait: (get("wait") ?? "false").toLowerCase() === "true",
    key: get("key") ?? slugKey(title),
    title,
    language: get("language"),
  };
}

function safePrefix(s: string, token: string): number {
  const maxTail = Math.min(s.length, token.length - 1);
  for (let t = maxTail; t > 0; t--) {
    if (token.startsWith(s.slice(s.length - t))) return s.length - t;
  }
  return s.length;
}

function couldStartToken(s: string, token: string): boolean {
  if (s.length === 0) return false;
  const probe = s.slice(0, token.length);
  return token.startsWith(probe) || s.includes(token);
}

function findTagEnd(s: string): number {
  let inQuote: '"' | "'" | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuote) {
      if (c === inQuote) inQuote = null;
    } else if (c === '"' || c === "'") {
      inQuote = c;
    } else if (c === ">") {
      return i;
    }
  }
  return -1;
}
