/**
 * Streaming-safe <craft> tag parser (bidirectional-engine-plan §3).
 *
 * Feed it provider text deltas; it emits events: prose text outside the tag,
 * craft_open (parsed axes), craft_append (content bytes as they stream), and
 * craft_close. Live fields travel as a trailing <craft-live>{json}</craft-live>
 * sidecar AFTER </craft>, surfaced as craft_live.
 *
 * The hard part is split tokens: "<craft", an attribute value, or "</craft>"
 * can break across ANY delta boundary. A residual buffer holds back a tail that
 * could be the start of a token until we have enough to decide.
 */
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

  /** Flush any residual when the stream ends. */
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

  // outside: forward prose until "<craft" + a full opening tag (up to ">").
  private stepOutside(out: ParserEvent[]): boolean {
    const idx = this.buf.indexOf(OPEN);
    if (idx === -1) {
      // Emit everything that can't be the start of "<craft".
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
    // Need the full open tag: find the '>' that closes it, respecting quotes.
    const gt = findTagEnd(this.buf);
    if (gt === -1) return false; // wait for more
    const rawTag = this.buf.slice(0, gt + 1);
    this.buf = this.buf.slice(gt + 1);
    out.push({ type: "craft_open", attrs: parseCraftAttrs(rawTag) });
    this.state = "in_content";
    return true;
  }

  // in_content: append bytes until "</craft>".
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
    this.state = "in_live"; // a <craft-live> sidecar may follow
    return true;
  }

  // in_live: capture <craft-live>{json}</craft-live> if present; else drop to outside.
  // A <craft-live> sidecar may begin with leading whitespace and arrive byte by
  // byte, so we only leave for "outside" once non-whitespace bytes definitively
  // are NOT the start of "<craft-live>".
  private stepLive(out: ParserEvent[]): boolean {
    const openIdx = this.buf.indexOf(LIVE_OPEN);
    if (openIdx === -1) {
      const trimmed = this.buf.replace(/^\s+/, "");
      if (trimmed.length === 0) return false; // only whitespace so far — wait
      if (LIVE_OPEN.startsWith(trimmed.slice(0, LIVE_OPEN.length))) return false; // possible partial — wait
      this.state = "outside"; // definitely not a sidecar — resume outside scanning
      return true;
    }
    const closeIdx = this.buf.indexOf(LIVE_CLOSE, openIdx + LIVE_OPEN.length);
    if (closeIdx === -1) return false; // wait for the closing tag
    this.live = this.buf.slice(openIdx + LIVE_OPEN.length, closeIdx);
    this.buf = this.buf.slice(closeIdx + LIVE_CLOSE.length);
    out.push({ type: "craft_live", json: this.live.trim() });
    this.state = "outside";
    return true;
  }
}

/** Parse `<craft surface="panel" format="html" wait="false" key="..." title="...">`. */
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

// ── token-boundary helpers ──

/** Largest prefix length of `s` that cannot be the start of `token`. */
function safePrefix(s: string, token: string): number {
  // The unsafe tail is the longest suffix of s that is a prefix of token.
  const maxTail = Math.min(s.length, token.length - 1);
  for (let t = maxTail; t > 0; t--) {
    if (token.startsWith(s.slice(s.length - t))) return s.length - t;
  }
  return s.length;
}

/** Could `s` be the (possibly partial) start of `token`? */
function couldStartToken(s: string, token: string): boolean {
  if (s.length === 0) return false;
  const probe = s.slice(0, token.length);
  return token.startsWith(probe) || s.includes(token);
}

/** Find the index of the '>' that closes an opening tag, ignoring quoted '>' . */
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
