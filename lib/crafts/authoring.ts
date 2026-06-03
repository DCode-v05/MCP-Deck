/**
 * Craft authoring (bidirectional-engine-plan §1–5): the engine AUTHORS a live
 * UI as a <craft> tag instead of plain text. Given a user request + the real
 * MCP tool catalogue, the model writes ONE <craft> HTML tag with data-craft-bind
 * (data IN) and data-craft-emit (actions OUT), plus a <craft-live> sidecar of
 * subscribe[]/actions[] bound to REAL tool ids.
 *
 * Server-only (imports provider SDKs). The product runs it; the engine reasons
 * once to author, then stops.
 */
import { getProvider, type ProviderId } from "@/lib/engine/providers";
import type { AgentMessage } from "@/lib/engine/tools";
import type { McpProvider } from "@/lib/mcpdeck/provider";
import { CraftStreamParser, type OpenAttrs, type ParserEvent } from "./craft-parser";
import {
  newCraftBlock,
  sanitizeCraftHtml,
  type CraftAction,
  type CraftBlock,
  type Subscribe,
} from "./craft-block";

export interface AuthorResult {
  block: CraftBlock | null;
  prose: string; // any text the model emitted outside the craft
  raw: string;
}

export function buildAuthoringPrompt(provider: McpProvider): string {
  const lines: string[] = [
    `You are a UI-authoring engine. Given the user's request, you AUTHOR a live,`,
    `interactive UI as ONE <craft> tag — never plain prose describing data.`,
    ``,
    `# Output contract`,
    `Emit exactly ONE <craft> tag, then a <craft-live> JSON sidecar. Example:`,
    ``,
    `<craft surface="panel" format="html" wait="false" key="gh-repos" title="GitHub repositories">`,
    `  <div class="cards" data-craft-bind="repos">Loading repositories…<template data-craft-each data-craft-row-id="id"><div class="row"><span data-craft-field="name"></span> · <span data-craft-field="updated_at"></span></div></template></div>`,
    `</craft>`,
    `<craft-live>{`,
    `  "subscribe":[{"channel":"github.search_repositories","args":{"query":"user:@me sort:updated","perPage":10},"as":"repos","poll_s":5}],`,
    `  "actions":[]`,
    `}</craft-live>`,
    ``,
    `# Real-time model (IMPORTANT — no buttons)`,
    `The product handles BOTH directions automatically — never author Refresh, Save, or Update buttons:`,
    `- Data IN auto-refreshes: every data-craft-bind / data-craft-each list re-polls on its poll_s cadence, so new/changed rows appear on their own. There is NO Refresh button — never author one.`,
    `- Data OUT auto-saves: every editable [data-craft-input] commits on its own ~1s after the user stops typing (or on blur). There is NO Save button and NO approval modal — never author one. You STILL author the matching WRITE action in actions[] (with idArg for lists) — the renderer finds it and fires it automatically. Just omit the button from the HTML.`,
    `Use a SHORT poll_s (3–8) so the view feels live.`,
    ``,
    `# Rules`,
    `- NEVER FABRICATE DATA. This is the most important rule. You do NOT know the actual rows, names, dates, or values — they only exist after the channel streams live. So:`,
    `  · NEVER write real-looking data values (repo names, issue titles, dates, counts) as static text in the HTML — that is hallucination and will be WRONG. ALL displayed data MUST come from a data-craft-bind / data-craft-each that the product fills from the live channel.`,
    `  · NEVER invent fields the API doesn't return. GitHub repos have name/full_name/description/updated_at/language/stargazers_count/html_url/default_branch/private — there is NO "summary" field, so do NOT add summaries. Show only REAL fields.`,
    `  · If the request says "summarise" or "describe", you still CANNOT summarise per-row live (no per-tick reasoning). Just render the real fields (e.g. description when present); do not fabricate prose.`,
    `  · The ONLY non-data text allowed in static HTML is fixed labels/headings (e.g. "Repositories", "Updated:", "Branch:"). Every value goes in a bound element.`,
    `- RENDER REAL FIELDS PER ROW: inside a <template data-craft-each>, mark each value element with data-craft-field="<dot path on the row>" — the renderer fills its text from that row field. e.g. <span data-craft-field="name"></span>, <span data-craft-field="updated_at"></span>, <span data-craft-field="description"></span>. For a Notion page/row TITLE, use data-craft-field="@title" (a robust token the renderer resolves to the real page title regardless of the property name) — do NOT guess properties.<name>.title.0.plain_text. For the LIST query, pick the right args so it returns the rows the user asked for (GitHub recent repos: github.search_repositories args {"query":"user:@me sort:updated","perPage":10}; ALWAYS include sort:updated for "recently updated").`,
    `- EDITABLE BY DEFAULT: whenever you show data that a WRITE tool could update, render it as EDITABLE fields (inputs/textareas) — NO Save button; edits auto-save. DO NOT wait for the user to ask to edit. The user expects to view AND edit in one craft. Only fall back to read-only text when no matching write tool exists.`,
    `  · Showing a Notion page's blocks → ALSO render the PAGE TITLE as its own editable field at the top: an <input data-craft-input="properties.title.0.text.content" value="<current title from Resolved data>"> (NO Save button) and author the matching write action {name:"saveTitle",route:"direct",op:"notion.API-patch-page",channel:"<a subscribed read channel>",hasSideEffect:true,args:{"page_id":"<real page id>","properties":{"title":[{"text":{"content":""}}]}}}, AND render the blocks as the editable list below. TWO editable sections in one craft: title (patch-page) + blocks (update-a-block, the per-row list). The title input auto-saves on edit.`,
    `  · Showing issues/rows → each row's title/description editable (auto-saved via the update tool). Always pair a visible value with an editable field bound to a write action.`,
    `- surface: "panel" for dashboards/tables, "inline" for small confirms/chips.`,
    `- format: "html". wait: "false" unless you must pause for a user decision.`,
    `- The HTML may use class names and inline structure. NO <script>, NO on* handlers, NO <style>, NO <form>. Interactivity is ONLY via data-craft-* attributes.`,
    `- data-craft-bind="<as>" marks an element the product fills with live data from the channel aliased <as>. Put a short "Loading…" inside it.`,
    `- data-craft-emit="<name>" marks a button/element that fires action <name>.`,
    `- data-craft-input="<argName>" on an <input>/<textarea>/<select> captures user text; on emit it merges into the action's args under <argName>. Use for WRITE actions needing user content (issue title, message body).`,
    `- NEVER author a Refresh / Save / Update / Reload button. Reads auto-poll and edits auto-save (see "Real-time model"). A button for either is forbidden.`,
    `- WRITE: when the request implies create/send/update, add the matching [WRITE] tool as a route:"direct" action with args drawn from the data-craft-input fields you include in the HTML. The product AUTO-SAVES edits (no approval prompt) and re-polls after, so the change shows live. (For a discrete create — e.g. "create an issue" — you MAY author a single button via data-craft-emit; for editing existing values use auto-saving fields, no button.)`,
    `- subscribe[]: which tools to poll for live data IN. Use REAL tool ids + the alias the markup binds.`,
    `- ONLY subscribe to tools whose REQUIRED args you can fill NOW. If a "# Resolved data" section is present in the request, it contains REAL ids — use those exact ids to subscribe to drill-in tools (e.g. notion.API-get-block-children with the real block_id/page id from the resolved Notion page; linear_getProjectIssues with the real projectId; slack_get_channel_history with the real channel_id). If no real id is available, subscribe to the PARENT list tool instead (never invent an id).`,
    `- EDITING (single entity): if the user wants to rename/edit ONE entity, author an <input data-craft-input="<argPath>"> PRE-FILLED via value="<current value from resolved data>" (NO Save button), plus the matching WRITE action in actions[] with the real id already in args. data-craft-input is the EXACT arg path (dots/indexes for nested). Example renaming a Notion page: input data-craft-input="properties.title.0.text.content" value="Test", action {name:"saveName",route:"direct",op:"notion.API-patch-page",hasSideEffect:true,args:{"page_id":"<real id>","properties":{"title":[{"text":{"content":""}}]}}}. The typed value deep-merges into args; the edit auto-saves and the view re-polls. Provide the full args skeleton so the merge target exists.`,
    `- EDITABLE LIVE LIST (view-and-edit EACH streamed row, e.g. edit every block on a page, rename every issue): you do NOT know the rows or their ids at authoring time — they only exist after the channel streams. Author ONE row TEMPLATE, not N rows:`,
    `    (1) A normal bound container whose FIRST child is a single <template data-craft-each> holding the markup for ONE row: <div data-craft-bind="<as>">Loading…<template data-craft-each ...>…ROW…</template></div>.`,
    `    (2) Inside the template put exactly one <input>/<textarea data-craft-input="<argPath relative to the write body>"> per editable field — NO Save button. The renderer clones the template per streamed row, pre-fills each field from the row, stamps the row's REAL runtime id on the clone, and AUTO-SAVES that row's write when the field is edited.`,
    `    (3) On the <template>: data-craft-row-id="<the row's own id field>" (default "id"; "number" for GitHub issues). On a Notion text input: omit data-craft-from (the renderer reads block text automatically); elsewhere set data-craft-from="<row source path>" for the pre-fill.`,
    `    (4) Author ONE save action in actions[]: route:"direct", op = the WRITE tool, channel = a tool you SUBSCRIBE to in subscribe[] (the READ list tool — NOT the write tool; channel only names the live session, op is what runs). Add "idArg":"<arg the per-row id is written to>" (Notion "block_id", Linear "id", GitHub "issue_number"). OMIT that id from args — it is injected from the clicked row at click time. args holds only the rest of the write skeleton.`,
    `    (5) The subscribe id is the PARENT (page id / projectId / owner+repo); the per-row write id is the CHILD captured at click time — they DIFFER, which is why the id is omitted from args.`,
    `    (6) Notion update-a-block keys the body by the block TYPE. For mixed types set data-craft-type-from="type" on BOTH the <template> and the input, and write the path with a {type} token: data-craft-input="{type}.rich_text.0.text.content". The renderer substitutes each row's real type at click time. Scope editable rows to plain-text types (paragraph/heading_1/heading_2/heading_3/to_do) — update-a-block REPLACES rich_text.`,
    `    Notion example:`,
    `    <div data-craft-bind="blocks">Loading blocks…<template data-craft-each data-craft-row-id="id" data-craft-type-from="type"><div class="row"><textarea data-craft-input="{type}.rich_text.0.text.content" data-craft-type-from="type" rows="2"></textarea></div></template></div>`,
    `    actions: [{"name":"saveBlock","route":"direct","channel":"notion.API-get-block-children","op":"notion.API-update-a-block","idArg":"block_id","args":{},"hasSideEffect":true,"label":"Save block","confirm":"Update this block's text in Notion?"}]`,
    `    INVARIANTS: action.channel MUST be in subscribe[] (else the write silently no-ops); op = the WRITE tool; NEVER author the per-row id in args (idArg injects it).`,
    `- actions[]: each emit, route-STAMPED. route:"direct" = a mechanical tool call (read or write) straight through the channel. route:"engine" = needs reasoning. Use route:"direct" for concrete tool calls.`,
    `- For a WRITE action set "hasSideEffect": true (these are real writes). Edits auto-save with NO approval prompt — do not rely on or mention an approval step.`,
    `- Bind to the user's intent. Prefer read tools for the initial view; add write actions only if the request implies an action.`,
    ``,
    `# Available MCP tools (you may ONLY reference these ids)`,
  ];
  for (const s of provider.servers) {
    const tools = provider.tools.filter((t) => t.serverId === s.id);
    lines.push(`\n## ${s.id} — ${s.name}`);
    for (const t of tools) {
      const props = Object.keys(t.inputSchema.properties).join(",");
      lines.push(`- ${t.id}${t.hasSideEffect ? " [WRITE]" : ""} args:{${props}}`);
    }
  }
  lines.push(
    ``,
    `Output ONLY the <craft>…</craft><craft-live>…</craft-live>. A one-line lead before it is allowed.`,
  );
  return lines.join("\n");
}

/** Validate the authored live-fields sidecar against the real catalogue. */
function validateLive(
  json: string,
  provider: McpProvider,
): { subscribe: Subscribe[]; actions: CraftAction[] } {
  let parsed: { subscribe?: unknown; actions?: unknown } = {};
  try {
    parsed = JSON.parse(json);
  } catch {
    return { subscribe: [], actions: [] };
  }
  const knownTool = (id: unknown): id is string => typeof id === "string" && Boolean(provider.findTool(id));

  // A tool is pollable for a live subscription only if its REQUIRED args are all
  // satisfiable at authoring time. Tools needing a RUNTIME identifier (projectId,
  // owner/repo, channel_id) can't be — the engine doesn't have those ids yet, and
  // any value it invents (e.g. "__first__", "<projectId>") makes the API reject
  // every poll. So: drop a subscription if any required arg is missing/empty, a
  // placeholder, OR an id-shaped arg that isn't a real concrete value.
  const argsSatisfied = (toolId: string, args: Record<string, unknown>): boolean => {
    const req = provider.findTool(toolId)?.inputSchema.required ?? [];
    return req.every((k) => {
      const v = args[k];
      if (v === undefined || v === null || v === "") return false;
      if (typeof v === "string" && isPlaceholder(v)) return false;
      // An id-shaped required arg the model couldn't actually know -> drop.
      if (looksLikeIdArg(k) && !isConcreteId(v)) return false;
      return true;
    });
  };

  const subscribe: Subscribe[] = Array.isArray(parsed.subscribe)
    ? parsed.subscribe
        .map((s) => s as Record<string, unknown>)
        .filter((s) => knownTool(s.channel) && typeof s.as === "string")
        .map((s) => ({
          channel: String(s.channel),
          args: cleanArgs((s.args && typeof s.args === "object" ? s.args : {}) as Record<string, unknown>),
          as: String(s.as),
          // Short cadence so the view feels live; clamp anything slower than 8s
          // down to 5s (and the channel floor is 500ms) for real-time updates.
          poll_s: typeof s.poll_s === "number" ? Math.min(s.poll_s, 8) : 5,
        }))
        // Drop subscriptions whose required args aren't satisfiable yet
        // (checks the CLEANED args, after placeholders/meta were stripped).
        .filter((s) => argsSatisfied(s.channel, s.args))
    : [];

  const actions: CraftAction[] = Array.isArray(parsed.actions)
    ? parsed.actions
        .map((a) => a as Record<string, unknown>)
        .filter((a) => typeof a.name === "string")
        .map((a): CraftAction => {
          const op = typeof a.op === "string" ? a.op : typeof a.channel === "string" ? String(a.channel) : undefined;
          const tool = op ? provider.findTool(op) : undefined;
          // Safety: if the op is unknown or the route is missing, force route:engine.
          const route = a.route === "direct" && tool ? "direct" : "engine";
          return {
            name: String(a.name),
            route,
            channel: typeof a.channel === "string" ? a.channel : op,
            op,
            args: cleanArgs((a.args && typeof a.args === "object" ? a.args : {}) as Record<string, unknown>),
            // Trust the real catalogue for side-effect, not the model's claim.
            hasSideEffect: tool?.hasSideEffect ?? false,
            label: typeof a.label === "string" ? a.label : String(a.name),
            confirm: typeof a.confirm === "string" ? a.confirm : undefined,
            // Per-row editable lists: carry the late-bound id binding through verbatim.
            idArg: typeof a.idArg === "string" ? a.idArg : undefined,
            idFrom: typeof a.idFrom === "string" ? a.idFrom : undefined,
            typeFrom: typeof a.typeFrom === "string" ? a.typeFrom : undefined,
          };
        })
    : [];

  return { subscribe, actions };
}

// ── arg hygiene (servers reject fabricated / meta args) ──

/** Meta params some MCP servers list in their schema but REJECT when sent. */
const STRIP_ARG_KEYS = new Set(["Notion-Version"]);

/** Placeholder strings the model invents for ids it doesn't actually have. */
const PLACEHOLDER_RE = /^(__|<|\{|\$|first$|latest$|todo$|your[-_]|the[-_]|example|placeholder|xxx|id$|uuid$)/i;

function cleanArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (STRIP_ARG_KEYS.has(k)) continue; // drop meta params the server forbids
    if (typeof v === "string" && isPlaceholder(v)) continue; // drop fabricated placeholders
    out[k] = v;
  }
  return out;
}

function isPlaceholder(v: string): boolean {
  const s = v.trim();
  if (s.length === 0) return true;
  if (PLACEHOLDER_RE.test(s)) return true;
  if (s.startsWith("<") && s.endsWith(">")) return true;
  if (s.startsWith("{") && s.endsWith("}")) return true;
  if (/^(__\w+__|first|latest|none|null|undefined)$/i.test(s)) return true;
  return false;
}

/** Required-arg names that denote a runtime identifier the engine can't know. */
function looksLikeIdArg(key: string): boolean {
  return /(^|_)(id|ids)$|Id$|^owner$|^repo$|^channel_id$|^projectId$|^teamId$|^block_id$|^page_id$|^data_source_id$|^user_id$/i.test(
    key,
  );
}

/** A concrete id is a real UUID or a long-enough opaque token — not a word/placeholder. */
function isConcreteId(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (isPlaceholder(s)) return false;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuid.test(s)) return true;
  // GitHub owner/repo are short words, not ids — those still can't be known at
  // authoring time, so require they be absent (handled by looksLikeIdArg). A
  // genuinely concrete opaque token is long + non-spacey.
  return s.length >= 16 && !/\s/.test(s);
}

/**
 * Phase 1 — RESOLVE. Before authoring, ask the model which read-only lookups it
 * needs to obtain concrete ids the request implies (e.g. the page_id of "Test
 * Page", the projectId of "the first project"). We run those reads and feed the
 * results back so phase-2 authoring can bind drill-in tools (get-block-children,
 * getProjectIssues, get_channel_history) with REAL ids — making per-entity
 * detail views work for every app.
 */
async function resolveIds(
  request: string,
  provider: McpProvider,
  providerId: ProviderId,
  priorMessages: AgentMessage[],
): Promise<string> {
  const readTools = provider.tools.filter((t) => !t.hasSideEffect);
  const prompt = [
    `You plan data lookups for a UI request. Output ONLY a JSON array (max 3) of read-only`,
    `tool calls whose RESULTS contain ids needed to show the requested detail. Empty array if`,
    `the request needs no specific entity. Each: {"tool":"<id>","args":{...}}.`,
    `Resolve names to ids: to find a Notion page named X use notion.API-post-search {"query":"X"};`,
    `to find a project/team/channel use the relevant list tool. Do NOT guess ids.`,
    ``,
    `Read tools:`,
    ...readTools.map((t) => `- ${t.id} args:{${Object.keys(t.inputSchema.properties).join(",")}}`),
    ``,
    `Request: ${request}`,
    `JSON array only:`,
  ].join("\n");

  const invoker = getProvider(providerId);
  let text = "";
  // Resolve is load-bearing for editable/drill-in lists, so retry once on a
  // transient provider overload before giving up.
  for (let attempt = 0; attempt < 2 && !text; attempt++) {
    try {
      const turn = invoker(prompt, [...priorMessages, { role: "user", content: request }], []);
      for await (const ev of turn.stream) if (ev.type === "text") text += ev.delta;
      await turn.done().catch(() => undefined);
    } catch {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1200)); // brief backoff, then retry
        continue;
      }
      return ""; // give up; author without resolution
    }
  }

  let lookups: Array<{ tool?: unknown; args?: unknown }> = [];
  try {
    const m = text.match(/\[[\s\S]*\]/);
    if (m) lookups = JSON.parse(m[0]);
  } catch {
    return "";
  }

  const facts: string[] = [];
  for (const l of lookups.slice(0, 3)) {
    if (typeof l.tool !== "string" || !provider.findTool(l.tool)) continue;
    const args = cleanArgs((l.args && typeof l.args === "object" ? l.args : {}) as Record<string, unknown>);
    try {
      const { result, isError } = await provider.callTool(l.tool, args);
      if (!isError) facts.push(`${l.tool}(${JSON.stringify(args)}) ->\n${truncate(result, 1500)}`);
    } catch {
      /* skip failed lookup */
    }
  }
  return facts.length > 0 ? `\n\n# Resolved data (use REAL ids from here)\n${facts.join("\n\n")}` : "";
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + "…";
}

/**
 * Author a craft for a request. Resolves concrete ids first (phase 1), then
 * streams the provider through the parser to assemble a CraftBlock (phase 2).
 */
export async function authorCraft(
  request: string,
  provider: McpProvider,
  opts: { providerId: ProviderId; threadId: string; id: string; ts: string; priorMessages?: AgentMessage[] },
  onEvent?: (ev: ParserEvent) => void,
): Promise<AuthorResult> {
  const invoker = getProvider(opts.providerId);
  // Phase 1: resolve ids the request needs (page_id, projectId, …).
  const resolved = await resolveIds(request, provider, opts.providerId, opts.priorMessages ?? []).catch(() => "");
  const userContent = resolved ? `${request}${resolved}` : request;
  const messages: AgentMessage[] = [...(opts.priorMessages ?? []), { role: "user", content: userContent }];
  const turn = invoker(buildAuthoringPrompt(provider), messages, []);

  const parser = new CraftStreamParser();
  let raw = "";
  let prose = "";
  let content = "";
  let openAttrs: OpenAttrs | null = null;
  let liveJson = "";

  const handle = (ev: ParserEvent) => {
    onEvent?.(ev);
    if (ev.type === "text") prose += ev.delta;
    else if (ev.type === "craft_open") openAttrs = ev.attrs;
    else if (ev.type === "craft_append") content += ev.delta;
    else if (ev.type === "craft_live") liveJson = ev.json;
  };

  for await (const tev of turn.stream) {
    if (tev.type === "text") {
      raw += tev.delta;
      for (const ev of parser.push(tev.delta)) handle(ev);
    }
  }
  for (const ev of parser.end()) handle(ev);
  await turn.done().catch(() => undefined);

  const attrs = openAttrs as OpenAttrs | null;
  if (!attrs) return { block: null, prose: prose.trim(), raw };

  const { subscribe, actions } = validateLive(liveJson, provider);
  const block = newCraftBlock({
    id: opts.id,
    thread_id: opts.threadId,
    surface: attrs.surface,
    format: attrs.format,
    wait: attrs.wait,
    key: attrs.key,
    title: attrs.title,
    language: attrs.language,
    content: sanitizeCraftHtml(content),
    subscribe,
    actions,
    ts: opts.ts,
  });
  return { block, prose: prose.trim(), raw };
}
