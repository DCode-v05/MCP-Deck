"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useChannel } from "@/lib/hooks/useChannel";
import { sanitizeCraftHtml, type CraftAction, type CraftBlock } from "@/lib/crafts/craft-block";
import type { ChannelBinding } from "@/lib/channels/wire";

/**
 * The single sandboxed renderer (bidirectional-engine-plan §12). It:
 *  - renders the engine-authored HTML (sanitized, injected via ref so React
 *    never re-touches the inner DOM),
 *  - subscribes the craft's subscribe[] channels (live data IN) and fills
 *    [data-craft-bind] targets each tick — NO engine reasoning per tick, so the
 *    view AUTO-REFRESHES on the poll cadence (no manual Refresh button),
 *  - AUTO-SAVES editable fields (data OUT): when a [data-craft-input] changes and
 *    the user pauses (~1s) or blurs, the matching route:direct write fires on its
 *    own — no Save button, no approval modal. route:engine actions resume the
 *    thread via /api/execute.
 */
export function CraftRenderer({
  block,
  onEdited,
  providerId,
}: {
  block: CraftBlock;
  onEdited?: (next: CraftBlock) => void;
  providerId?: string;
}) {
  const p = block.payload;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Live data IN — subscribe to the craft's channels (fan-in, one SSE).
  const bindings: ChannelBinding[] = useMemo(
    () => p.subscribe.map((s) => ({ channel: s.channel, args: s.args, as: s.as, poll_s: s.poll_s })),
    [p.subscribe],
  );
  const { state, request, refresh } = useChannel(block.thread_id, block.id, bindings);

  // Inputs the user typed into the craft (data-craft-input="name") are captured
  // and merged into a write action's args. The name may be a dot/bracket path
  // (e.g. "properties.title.0.text.content") so a write can target a nested arg.
  function collectInputs(): Record<string, unknown> {
    const el = containerRef.current;
    if (!el) return {};
    const out: Record<string, unknown> = {};
    el.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "[data-craft-input]",
    ).forEach((node) => {
      // Skip inputs inside a per-row clone — those belong to that row's own Save,
      // not the whole-craft save (a single-entity write like a page title).
      if (node.closest("[data-craft-row]")) return;
      const name = node.getAttribute("data-craft-input");
      if (name) setPath(out, name, node.value);
    });
    return out;
  }

  // Inject the sanitized HTML once per version (manual innerHTML preserves our
  // own bindings; we re-bind delegated clicks after each injection).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = sanitizeCraftHtml(p.content);
    // Seed the dirty-tracking baseline for whole-craft inputs (e.g. a page title
    // authored with value="…") so auto-save fires only on a real change.
    el.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-craft-input]").forEach((node) => {
      if (node.closest("[data-craft-row]")) return; // row inputs are seeded on render
      node.dataset.craftCommitted = node.value;
    });
  }, [p.content, p.version]);

  // Live data -> fill [data-craft-bind="<as>"] targets each tick.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    for (const sub of p.subscribe) {
      const target = el.querySelector<HTMLElement>(`[data-craft-bind="${cssEscape(sub.as)}"]`);
      if (!target) continue;
      const payload = state.data[sub.as];
      if (payload === undefined) continue;
      // Editable-list branch: a <template data-craft-each> means render each row
      // as a clone (editable fields), id-stamped. Otherwise the legacy label list.
      const tmpl = target.querySelector<HTMLTemplateElement>(":scope > template[data-craft-each]");
      if (tmpl) {
        renderEachInto(target, tmpl, toRows(payload) ?? []);
      } else {
        target.innerHTML = renderBound(payload);
      }
    }
  }, [state.data, p.subscribe, p.content, p.version]);

  // Delegated [data-craft-emit] clicks -> route by the stamped route.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onClick = (e: Event) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-craft-emit]");
      if (!target) return;
      e.preventDefault();
      const name = target.getAttribute("data-craft-emit");
      const action = p.actions.find((a) => a.name === name);
      if (!action) return;
      // Per-row editable list: inject THIS row's captured id + scoped inputs.
      const rowEl = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-craft-row]");
      if (action.idArg && rowEl) {
        const args = structuredClone(action.args ?? {});
        setPath(args, action.idArg, rowEl.dataset.rowId ?? "");
        deepMerge(args, collectRowInputs(rowEl));
        // args are complete for THIS row — run() must not re-collect whole-craft inputs.
        void fire({ ...action, args, _argsFinal: true });
        return;
      }
      void fire(action);
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.actions, p.version]);

  // AUTO-SAVE: an editable field commits on its own ~1s after the last keystroke,
  // or immediately on blur — no Save button, no approval modal.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
    const commit = (input: HTMLInputElement | HTMLTextAreaElement) => {
      timers.delete(input);
      if ((input.dataset.craftCommitted ?? "") === input.value) return; // unchanged
      void autoSave(input);
    };
    const queue = (e: Event) => {
      const input = (e.target as HTMLElement | null)?.closest<HTMLInputElement>("[data-craft-input]");
      if (!input) return;
      const prev = timers.get(input);
      if (prev) clearTimeout(prev);
      timers.set(input, setTimeout(() => commit(input), 1000));
    };
    const flush = (e: Event) => {
      const input = (e.target as HTMLElement | null)?.closest<HTMLInputElement>("[data-craft-input]");
      if (!input) return;
      const prev = timers.get(input);
      if (prev) clearTimeout(prev);
      commit(input);
    };
    el.addEventListener("input", queue);
    el.addEventListener("blur", flush, true); // capture: blur doesn't bubble
    return () => {
      el.removeEventListener("input", queue);
      el.removeEventListener("blur", flush, true);
      for (const t of timers.values()) clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.actions, p.version]);

  // Is this action just re-reading a channel the craft already subscribes to?
  // (e.g. a "Refresh" button whose op == the subscribed list tool). Then it's a
  // live re-poll, not a detached call.
  function isRefreshOf(action: CraftAction): boolean {
    return !action.hasSideEffect && p.subscribe.some((s) => s.channel === action.op);
  }

  async function fire(action: CraftAction) {
    // Auto-save, no confirm: writes run directly (no approval modal). The data
    // motion is symmetric — reads auto-poll in, edits auto-save out.
    await run(action);
  }

  // Auto-save: find the route:direct write that owns an edited field, fire it
  // with that field's row id + scoped inputs, and mark the field saved.
  async function autoSave(input: HTMLInputElement | HTMLTextAreaElement) {
    const rowEl = input.closest<HTMLElement>("[data-craft-row]");
    let action: CraftAction | undefined;
    let finalArgs: Record<string, unknown> | undefined;
    if (rowEl) {
      // Per-row list: the save action carries a late-bound row id (idArg).
      action = p.actions.find((a) => a.idArg && a.route === "direct" && a.op);
      if (action?.idArg) {
        finalArgs = structuredClone(action.args ?? {});
        setPath(finalArgs, action.idArg, rowEl.dataset.rowId ?? "");
        deepMerge(finalArgs, collectRowInputs(rowEl));
      }
    } else {
      // Whole-craft single entity (e.g. a page title): the write with no row id.
      action = p.actions.find((a) => a.hasSideEffect && !a.idArg && a.route === "direct" && a.op);
      if (action) finalArgs = deepMerge(structuredClone(action.args ?? {}), collectInputs());
    }
    if (!action || !finalArgs) return; // no write tool to save this field into
    const ok = await run({ ...action, args: finalArgs, _argsFinal: true }, { auto: true });
    if (ok) input.dataset.craftCommitted = input.value;
  }

  async function run(action: CraftAction, opts?: { auto?: boolean }): Promise<boolean> {
    setBusy(true);
    if (opts?.auto) setToast("Saving…");
    let ok = false;
    try {
      if (action.route === "direct" && isRefreshOf(action)) {
        // Live re-poll: force the subscribed channels to poll NOW; fresh data
        // (e.g. a repo created elsewhere) fans back over the open SSE.
        await refresh();
        setToast("Refreshed ✓");
        ok = true;
      } else if (action.route === "direct" && action.channel && action.op) {
        // A real route:direct call (often a WRITE). If the args were already fully
        // assembled (per-row id + inputs, or auto-save), use them verbatim;
        // otherwise deep-merge the whole-craft input fields over the template.
        const args = action._argsFinal
          ? (action.args ?? {})
          : deepMerge(structuredClone(action.args ?? {}), collectInputs());
        const res = (await request(action.channel, action.op, args)) as { isError?: boolean };
        if (res?.isError) {
          setToast(opts?.auto ? "Save failed." : "Action failed.");
        } else {
          // To-and-fro: the asset changed -> re-poll so the live view reflects it.
          await refresh();
          setToast(opts?.auto ? "Saved ✓" : `${action.label ?? action.name} ✓`);
          ok = true;
        }
      } else {
        // route:engine — resume the thread; the engine re-authors version+1.
        const res = await fetch("/api/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            thread_id: block.thread_id,
            block_id: block.id,
            action: action.name,
            text: `${action.label ?? action.name} ${JSON.stringify(collectInputs())}`.trim(),
            providerId,
          }),
        });
        const data = (await res.json()) as { block?: CraftBlock; error?: string };
        if (data.block && onEdited) onEdited(data.block);
        setToast(data.error ? `Engine: ${data.error}` : "Updated by the engine ✓");
        ok = !data.error;
      }
    } catch {
      setToast(opts?.auto ? "Save failed." : "Action failed.");
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 3500);
    }
    return ok;
  }

  return (
    <div
      className={
        p.surface === "panel"
          ? "rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
          : "rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
      }
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)] bg-[var(--surface-2)]/50">
        <span className="text-[11px] font-mono text-[var(--secondary)] truncate">
          {p.title}
          <span className="ml-1.5 opacity-60">v{p.version}</span>
        </span>
        <span className="text-[10px] font-mono text-[var(--secondary)] inline-flex items-center gap-1">
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
          {[
            state.connected && p.subscribe.length > 0 ? "live" : "",
            p.actions.some((a) => a.hasSideEffect) ? "auto-saves" : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>

      {/* The engine-authored UI. */}
      <div ref={containerRef} className="craft-body p-3 text-[13px] leading-relaxed" />

      {toast && (
        <div className="px-3 py-1.5 text-[11px] border-t border-[var(--border)] text-[var(--secondary)]">{toast}</div>
      )}
    </div>
  );
}

// ── live-data rendering (deterministic, no eval) ──
function renderBound(payload: unknown): string {
  const rows = toRows(payload);
  if (rows === null) return `<pre class="craft-pre">${esc(JSON.stringify(payload, null, 2)).slice(0, 4000)}</pre>`;
  if (rows.length === 0) return `<div class="craft-empty">No items.</div>`;
  return `<ul class="craft-list">${rows
    .slice(0, 50)
    .map((r) => `<li>${esc(rowLabel(r))}</li>`)
    .join("")}</ul>`;
}

function toRows(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const o = payload as Record<string, unknown>;
    for (const k of ["items", "results", "channels", "members", "nodes"]) {
      if (Array.isArray(o[k])) return o[k] as unknown[];
    }
  }
  return null;
}

function rowLabel(r: unknown): string {
  if (r == null) return "";
  if (typeof r !== "object") return String(r);
  const o = r as Record<string, unknown>;

  // Notion BLOCK (get-block-children): text lives in <type>.rich_text[].plain_text.
  const block = notionBlockText(o);
  if (block !== null) return block; // may be "" for an empty block — still valid

  // Slack message (get_channel_history): { text, user }.
  if (typeof o.text === "string" && (o.type === undefined || o.user !== undefined)) return o.text as string;

  // Prefer a human title across the different SaaS shapes.
  for (const k of ["full_name", "name", "title", "identifier", "subject", "summary"]) {
    if (typeof o[k] === "string" && o[k]) return o[k] as string;
  }

  // Notion: title lives in properties.<Name>.title[].plain_text.
  const notion = notionTitle(o);
  if (notion) return notion;

  // Slack channels: #name; GitHub branches: ref; etc. handled above.
  // Last resort: a URL's last path segment, or a short JSON — but NEVER a bare id/UUID.
  if (typeof o.url === "string" && o.url) {
    const seg = decodeURIComponent(o.url.split("/").pop() ?? "").replace(/-[0-9a-f]{32}$/i, "");
    if (seg && !isUuidish(seg)) return seg.replace(/-/g, " ");
  }
  return "Untitled";
}

/** Notion block: { type, <type>: { rich_text:[{plain_text}] } } -> the text, or null if not a block. */
function notionBlockText(o: Record<string, unknown>): string | null {
  if (o.object !== "block" || typeof o.type !== "string") return null;
  const body = o[o.type as string] as { rich_text?: Array<{ plain_text?: string }> } | undefined;
  const rt = body?.rich_text;
  if (Array.isArray(rt)) return rt.map((x) => x.plain_text ?? "").join("");
  return ""; // a block with no text (divider, image…) still renders as a row
}

function notionTitle(o: Record<string, unknown>): string | null {
  const props = o.properties as Record<string, unknown> | undefined;
  if (props && typeof props === "object") {
    for (const v of Object.values(props)) {
      const t = (v as { title?: Array<{ plain_text?: string }> })?.title;
      if (Array.isArray(t) && t[0]?.plain_text) return t[0].plain_text;
    }
  }
  // A data_source / database has a top-level title array too.
  const t = o.title as Array<{ plain_text?: string }> | undefined;
  if (Array.isArray(t) && t[0]?.plain_text) return t[0].plain_text;
  return null;
}

function isUuidish(s: string): boolean {
  const hex = s.replace(/-/g, "");
  return hex.length >= 30 && /^[0-9a-f]+$/i.test(hex);
}

/** Set a nested value by dot/bracket path: "properties.title.0.text.content". */
function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.replace(/\[(\w+)\]/g, ".$1").split(".").filter(Boolean);
  let cur: Record<string, unknown> | unknown[] = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    const nextIsIndex = /^\d+$/.test(keys[i + 1]);
    const container = cur as Record<string, unknown>;
    if (container[k] == null || typeof container[k] !== "object") {
      container[k] = nextIsIndex ? [] : {};
    }
    cur = container[k] as Record<string, unknown> | unknown[];
  }
  (cur as Record<string, unknown>)[keys[keys.length - 1]] = value;
}

/** Read a nested value by dot/index path (read-side mirror of setPath). */
function getPath(obj: unknown, path: string): unknown {
  const keys = path.replace(/\[(\w+)\]/g, ".$1").split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const k of keys) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/**
 * Resolve a [data-craft-field] path on a row, with a robust title fallback.
 * Notion title property names vary (title / Name / …), so an authored path
 * often misses. For a "@title"/title/name path that comes back empty, dig the
 * real title out of the row via notionTitle/rowLabel instead of showing "—".
 */
function resolveField(row: unknown, rawPath: string): unknown {
  const path = rawPath.replace(/^@/, "");
  const v = getPath(row, path);
  // title/name appearing as a path segment (title, @title, properties.title.title.0.plain_text…)
  const wantsTitle = rawPath.startsWith("@") || /(^|[._[])(title|name)([._\]]|$)/i.test(rawPath);
  if ((v == null || v === "") && wantsTitle && row && typeof row === "object") {
    const t = notionTitle(row as Record<string, unknown>);
    if (t != null && t !== "") return t;
    const label = rowLabel(row);
    if (label && label !== "Untitled") return label;
  }
  return v;
}

/** Humanize a real field value for display (dates -> readable; null -> em dash). */
function formatFieldValue(path: string, v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "string" && /(_at|_time|date)$/i.test(path) && !Number.isNaN(Date.parse(v))) {
    return new Date(v).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
  if (typeof v === "object") return ""; // never dump raw objects into a field
  return String(v);
}

/**
 * Editable-list render: clone a <template data-craft-each> once per streamed row,
 * pre-fill each [data-craft-input] from the row via the .value PROPERTY (never
 * innerHTML — so quotes/markup in real SaaS text can't inject), and stamp each
 * clone with its row's REAL runtime id (and type, for the Notion {type} splice).
 */
function renderEachInto(target: HTMLElement, tmpl: HTMLTemplateElement, rows: unknown[]): void {
  // Clear EVERYTHING except the <template> — prior row clones AND the static
  // "Loading…" placeholder text, so it doesn't linger above the live rows once
  // data arrives. (The template itself never renders on the live tree.)
  Array.from(target.childNodes).forEach((n) => {
    if (n !== tmpl) n.remove();
  });
  if (rows.length === 0) {
    target.appendChild(document.createTextNode("No items."));
  }
  const rowIdField = tmpl.dataset.craftRowId || "id";
  const typeFrom = tmpl.dataset.craftTypeFrom;
  for (const row of rows.slice(0, 50)) {
    const frag = tmpl.content.cloneNode(true) as DocumentFragment;
    const el = frag.firstElementChild as HTMLElement | null;
    if (!el) continue;
    el.setAttribute("data-craft-row", "");
    el.dataset.rowId = String(getPath(row, rowIdField) ?? "");
    if (typeFrom) el.dataset.rowType = String(getPath(row, typeFrom) ?? "");
    // Read-only field display: fill [data-craft-field="<path>"] from the row via
    // textContent (never innerHTML — real SaaS text can't inject markup).
    el.querySelectorAll<HTMLElement>("[data-craft-field]").forEach((node) => {
      const path = node.getAttribute("data-craft-field") || "";
      const v = resolveField(row, path);
      node.textContent = formatFieldValue(path, v);
    });
    // Editable fields: pre-fill [data-craft-input] via the .value PROPERTY.
    el.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-craft-input]").forEach((input) => {
      if (input === document.activeElement) return; // focus guard: don't clobber a mid-edit field
      const from = input.getAttribute("data-craft-from");
      const val = from
        ? getPath(row, from)
        : (row && typeof row === "object" ? notionBlockText(row as Record<string, unknown>) : null) ?? "";
      input.value = String(val ?? "");
      // Seed the auto-save dirty baseline so polling re-fills don't trigger a write.
      input.dataset.craftCommitted = input.value;
    });
    target.appendChild(frag);
  }
}

/** Read ONLY one clone's inputs (so rows don't bleed); splice the row type into {type} paths. */
function collectRowInputs(rowEl: HTMLElement): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  rowEl.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("[data-craft-input]").forEach((node) => {
    let name = node.getAttribute("data-craft-input");
    if (!name) return;
    if (node.getAttribute("data-craft-type-from")) {
      name = name.replace("{type}", String(rowEl.dataset.rowType ?? ""));
    }
    setPath(out, name, node.value);
  });
  return out;
}

/** Deep-merge source into target (objects recurse; arrays/scalars overwrite). */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === "object" && !Array.isArray(v) && target[k] && typeof target[k] === "object" && !Array.isArray(target[k])) {
      deepMerge(target[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      target[k] = v;
    }
  }
  return target;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function cssEscape(s: string): string {
  return s.replace(/["\\\]]/g, "\\$&");
}
