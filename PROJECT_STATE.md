# Project State — Bidirectional Interactive UI

> Snapshot saved before a Claude Code compaction. This is the single source of truth
> for where the project stands, what was built, what works (verified), and what's deferred.
> Last updated: 2026-06-02.

---

## 0. TL;DR — what this project is now

A **Next.js 15 / React 19 / TypeScript** prototype (npm package name `mini-bap`) whose ONLY surface is
**McpDeck** at `/` (plus a prompt→app studio at `/generate`). It turns an AI from request→response into a
**persistent engine loop driving live, interactive UI**. It connects to **real MCP servers** (GitHub,
Notion, Linear, Slack) and the engine **authors live interactive UI ("crafts")** bound to those tools —
with **editable fields that AUTO-SAVE** to the connected accounts and **live data that AUTO-REFRESHES** on
a poll loop. No Save/Refresh buttons, no per-edit approval modal (the user chose "auto-save, no confirm").

- Path: `d:\Deni\Mr.Tech\Experience\Internships\September Platforms\Production\BAP Product\Code\Interactive-Chatbot-Skills`
- **Not a git repo** (cleaned + ready for the user to `git init` and push; user does git themselves).
- Health: `npx tsc --noEmit` clean.

### History of this folder (important context — what was DELETED)
- **2026-06-01**: the original "widget chat" (System A) was deleted. Ignore ChatShell/useChat/widget-parser/run-engine.
- **2026-06-02 (this session)**: the entire `/apps` surface was deleted — the 18 "kit" apps, Tillpoint, the
  AppsGallery launcher, `app/api/apps/*`, `components/apps/*`, `lib/apps/*`, `useLiveApp`/`useTillpoint`.
  The **File System Server** was removed (mock-catalogue `fs` entries, the `fs` dashboard, the `fs` sample
  goal, the `fs` example in `.env`). The **/channels demo page + component** were removed (the polling
  ENGINE in `lib/channels/*` STAYS — it powers the auto-refresh). McpDeck moved `/apps/mcpdeck` → `/`; the
  generate studio moved `/apps/mcpdeck/generate` → `/generate`. Old paths redirect (next.config.ts).

---

## 1. The three pillars (and where they live)

### Pillar A — Channels (the bidirectional core) ✅ built + verified
- `lib/channels/` — `wire.ts` (protocol types + encodeFrame), `ref.ts` (channelKey via stableStringify),
  `channel.ts` (ONE shared poll loop, rev'd buffer, fan-out, `pollNow()`), `manager.ts`
  (ChannelManager lazy-create/ref-count/grace-drop + SubscriptionSession fan-in + `refreshSession`),
  `sources.ts` (`pollSource(op,args,tick)`: real path = getMcpProvider().callTool; synthetic `mock.*`).
- Routes: `app/api/channel/subscribe`, `[sessionId]/stream` (SSE fan-in), `[sessionId]/refresh`,
  `request/[key]` (route:direct via subscribed key), **`call`** (KEYLESS route:direct — runs any op
  directly, used for writes whose channel the engine guessed wrong).
- Client: `lib/hooks/useChannel.ts` ({state.data[as], rev, connected, request, refresh}).
- Demo: `components/channels/ChannelsDemo.tsx` + `app/channels/page.tsx` → `/channels`.
- DEFINING PROPERTY (verified): two crafts on the same channel = ONE poll loop, shared rev fanned out.

### Pillar B — Crafts (engine authors live UI) ✅ built + verified
- `lib/crafts/craft-block.ts` — CraftBlock envelope {id,type,thread_id,ts,payload{key,surface,format,
  wait,language,title,content,version, subscribe[], actions[]}}. `sanitizeCraftHtml` strips
  script/iframe/object/embed/link/meta/style/form/base + on* handlers + javascript: urls (keeps
  `<template>`/`<textarea>`/`<input>`/`data-*`). CraftAction has: name,route,channel,op,args,
  hasSideEffect,label,confirm, **idArg/idFrom/typeFrom** (per-row editable lists), **_argsFinal**
  (runtime: args already assembled).
- `lib/crafts/craft-parser.ts` — streaming `<craft>` tag parser, quote-aware, residual buffer for
  split tokens, `<craft-live>{json}</craft-live>` sidecar. VERIFIED split-token-safe (whole / per-char
  / random chunkings identical).
- `lib/crafts/thread-store.ts` — thread_id→{messages, crafts} (globalThis). Unblocks route:engine
  (real resume, NOT branchFrom's string-flatten).
- `lib/crafts/authoring.ts` — `authorCraft()`: **resolveIds (phase 1)** runs read tools to get real
  ids (page id, projectId) → fed into **phase 2** authoring prompt under "# Resolved data". Streams
  provider through CraftStreamParser. `validateLive` validates the live sidecar vs the real catalogue
  (drops subscriptions with missing/placeholder/id-shaped-unsatisfiable args; carries idArg/idFrom/
  typeFrom; trusts catalogue hasSideEffect). `cleanArgs` strips placeholders + `Notion-Version`.
  buildAuthoringPrompt rules: NEVER FABRICATE DATA (no baked values, no invented fields like a GitHub
  "summary"), RENDER REAL FIELDS via `data-craft-field`, EDITABLE BY DEFAULT, EDITABLE LIVE LIST
  (`<template data-craft-each>`), arg-satisfiability, action.channel must be a SUBSCRIBED channel.
- `components/crafts/CraftRenderer.tsx` — THE renderer. Sanitized innerHTML via ref; per-tick:
  `[data-craft-bind]` → `renderEachInto` (clone `<template data-craft-each>` per row; fill
  `[data-craft-field]` via textContent + `[data-craft-input]` via **.value PROPERTY** (XSS-safe, never
  innerHTML for row values); stamp `data-row-id`/`data-row-type`; focus guard) OR legacy `renderBound`.
  Delegated `[data-craft-emit]` clicks: per-row branch injects the row's id at `idArg` + scoped
  `collectRowInputs` ({type} splice) + `_argsFinal`; else whole-craft `collectInputs` (skips inputs
  inside `[data-craft-row]`). Writes → approval modal → `request()` → `refresh()`.
- Routes: `app/api/crafts/author` (author + persist on thread), `app/api/execute` (route:engine resume
  → re-author version+1 via bumpCraftVersion).
- Wired into Agent mode: `lib/hooks/useCraftAuthor.ts` + a "Live UI on/off" toggle in McpDeckPanel.
  Live UI ON (default): submitting a request AUTHORS a craft (rendered by CraftRenderer) instead of
  running the agent loop. The user's request shows as a chat bubble above each craft.

### Pillar C — McpDeck (the only surface) ✅ live
- `/` — Agent mode (goal/approval cockpit, collapsible rails, **Live UI** toggle) + Apps mode (read-only
  live dashboards per connected server: GitHub/Notion/Linear/Slack, bound to channels). `/generate` = the
  prompt→app studio (`CraftStudio` + `lib/mcpdeck/craft*`). `components/mcpdeck/*`, `lib/mcpdeck/*`.
- `lib/mcpdeck/real-client.ts` — connects real MCP stdio servers via MCPDECK_SERVERS. Hardened:
  win32 `npx.cmd`, credential passthrough allowlist, parallel connect + 45s timeout, **credential
  pre-check** (skips servers whose token is absent, with a clean info log). **hasSideEffect regex broad**
  (patch/comment/add/archive/invite/merge/…). Mock fallback = git/linear (fs removed).
- App dashboards: `components/mcpdeck/apps/*` (GithubDashboard/LinearDashboard/NotionDashboard/
  SlackDashboard + dashboard-kit + AppsMode), `lib/mcpdeck/apps/dashboards.ts`,
  `lib/hooks/useServerDashboard.ts` (3-state). Connection derived from `catalogue.servers`.
- **REMOVED this session**: the 18 kit apps, Tillpoint, and the filesystem MCP server (`lib/apps/*`,
  `mcp-fs.ts`, the fs catalogue/dashboard/goal entries).

---

## 2. Routes (app/api)
- channel: subscribe, [sessionId]/stream, [sessionId]/refresh, request/[key], call
- crafts: crafts/author, execute
- mcpdeck: start, stream, input, catalogue, generate, craft/run
- Pages: `/` (McpDeck), `/generate` (studio). Old `/apps*`, `/apps/mcpdeck*`, `/mcpdeck*` → redirect.
- REMOVED: `app/api/apps/*`, the `/channels` page.

## 2b. Agent-primary cross-app system (2026-06-02) — the current model
Every prompt now runs the MULTI-STEP AGENT across all connected apps (the single-shot craft author is
no longer the default). Decisions made with the user: **agent-primary (can still emit crafts)**,
**auto-run reads / approve writes**, **robust prototype**, **full write capability**.
- **Conversation history (2026-06-02, "save conversation history per session until dev runs"):** each run is
  already a globalThis `McpDeckSession` that buffers its full event stream (survives reloads until the dev
  process restarts — no DB, the chosen scope). Added `session.startedAt`/`finalSummary` + `listSessions()`;
  `GET /api/mcpdeck/history` lists runs (newest first). Client (`useMcpDeck`): `history` state, `loadRun()`
  re-opens a past session via the existing `/api/mcpdeck/stream?sessionId=` reconnect route and replays its
  buffer to rebuild the trace; on mount it restores the most recent run; a **History list** sits atop the
  left rail (McpDeckPanel `HistoryList`). New runs refresh the list.
- **Autonomous operating procedure (2026-06-02, "make it intellectual — don't make me enumerate steps"):**
  `engine.ts` `OPERATING_PROCEDURE` const = a synthesized, adversarially-judged operating procedure so a
  TERSE goal ("complete Project X", "solve the issue assigned to me") triggers full autonomous reasoning:
  forward cycle **ORIENT → SURVEY → PLAN → ACT → VERIFY → FINISH**; apps modeled as ONE knowledge graph
  where a mention of another app's entity is a POINTER to follow; hypothesis-driven discovery (seek
  DISconfirming evidence); infer the deliverable from evidence not the user's literal words; write-safety
  hardened (never write to an unread entity; additive-by-default; stop-and-ask before clobbering; no
  sha/force). MAX_ITERATIONS 16→20. (Designed via the `autonomous-operator-prompt` workflow.)
- `lib/mcpdeck/engine.ts` — rewritten: cross-app system prompt (chain Notion→Linear→GitHub, resolve
  names→ids, pass real ids forward, narrate reasoning before each call); **reads auto-run, writes
  (hasSideEffect) pause for approval**; MAX_ITERATIONS 6→16; per-tool 45s timeout + 1 retry for READS
  only (never retries writes); model-turn retry on transient overload; a `render_ui` tool that calls
  `authorCraft()` and emits a `{type:"craft"}` event (the agent can show a live editable panel); a no-
  tool-call turn is treated as finish.
- `lib/mcpdeck/types.ts` — added `{type:"craft"; block: CraftBlock}` event.
- `lib/hooks/useMcpDeck.ts` — state now has `traces: TraceItem[]` (reasoning | tool | craft | done) and
  `crafts: CraftBlock[]`; reducer builds the trace timeline + collects agent crafts. `activity`/
  `ActivityLine` removed.
- `components/mcpdeck/ModelProcessing.tsx` (NEW) — the "Model Processing" trace view: reasoning blocks +
  tool cards (args + collapsible result, auto vs write badge, status) + inline `CraftRenderer` panels +
  pending-write approval cards. Replaces ActivityStream.
- `components/mcpdeck/McpDeckPanel.tsx` — composer runs `start()` (agent), not craft authoring; tab
  "Activity"→"Model Processing"; SAMPLE GOALS removed; help text updated. Live-UI toggle already gone.
- DELETED: `components/mcpdeck/ActivityStream.tsx`, `lib/mcpdeck/sample-goals.ts`,
  `lib/hooks/useCraftAuthor.ts` (the composer no longer authors crafts; the AGENT emits them).
- Kept: `/generate` studio, `/api/crafts/author` + `/api/execute` routes (CraftRenderer still uses
  execute for route:engine), all craft + channel infra (auto-save/auto-poll from §2a still apply to
  agent-emitted crafts).

## 2a. Auto real-time (2026-06-02) — no Save/Refresh, no confirm
- **Reads auto-poll**: authored crafts subscribe with a short cadence (`poll_s` clamped ≤8, default 5;
  channel floor 500ms). `lib/crafts/authoring.ts` `validateLive`. The poll loop fans fresh snapshots over
  SSE → the view updates on its own; the engine is told NEVER to author a Refresh button.
- **Edits auto-save**: `CraftRenderer` listens for `input` (debounced ~1s) + `blur` on `[data-craft-input]`,
  dirty-tracks via `data-craft-committed`, and fires the matching `route:direct` write itself — per-row
  (inject row id at `idArg` + scoped inputs) or whole-craft (e.g. page title). **The ApprovalModal was
  removed**; writes run directly. The engine is told NEVER to author a Save button (but STILL author the
  write action in `actions[]` — the renderer finds it). Header shows "live · auto-saves"; toast "Saving…/Saved ✓".

---

## 3. VERIFIED LIVE (against the user's real accounts, 2026-06-02)
- Channel fan-out: 2 crafts on one channel → 1 poll loop, shared rev (rev1→2→3 on refresh).
- Craft authoring: engine authored real-tool-bound UI for GitHub/Linear/Notion.
- route:engine: "also show projects" → same craft id, version 2, added linear_getProjects subscribe.
- Notion content: "content inside Test Page" → resolved real page id → blocks loaded ("Hi I am from
  September AI").
- Real WRITES round-tripped (changed in Notion then restored): block text edit; page TITLE edit.
- GitHub anti-fabrication: now `query:"user:@me sort:updated"` → real repos (DCode-v05, Maison-Onyx,
  Real-Time-Chat); 0 baked names; no invented "summary"; binds real fields via data-craft-field.
- All 4 SaaS channels stream live; arg-hardening drops un-pollable subscriptions (e.g. getProjectIssues
  needing a projectId the engine can't know).

---

## 4. Bugs fixed in this session (so they're not re-introduced)
1. **session_id mismatch** — subscribe route returned `sessionId` but client read `session_id` →
   `/api/channel/undefined/stream` 404. Fixed: route maps to snake_case `SubscribeResponse`.
2. **Notion-Version 400** + **Linear `__first__` placeholder** — engine fabricates args. Fixed:
   cleanArgs strips meta params + placeholders; argsSatisfied drops id-shaped-unsatisfiable subs;
   pollSource strips Notion-Version + returns needsInput.
3. **Per-row Save "not updating"** — run() always re-ran whole-craft collectInputs(), overwriting the
   per-row args. Fixed: `_argsFinal` flag; collectInputs skips inputs inside `[data-craft-row]`.
4. **Title Save "Action failed"** — saveTitle action's channel (patch-page) wasn't a subscribed
   channel → keyByChannel lookup undefined → no-op. Fixed: keyless `/api/channel/call` route; request()
   falls back to it.
5. **Invisible craft headings** + **Notion UUID instead of title** — globals.css forces craft-body
   contrast (overrides engine inline colors); rowLabel digs into Notion properties.title / block
   rich_text, never shows a bare UUID.
6. **McpDeck credential noise** — credential pre-check skips unconfigured servers cleanly.
7. **Write detection** — broadened hasSideEffect regex so all mutating tools are approval-gated.

---

## 5. STILL DEFERRED (honest — not built)
- **shape/trigger DSL** (bidirectional-engine-plan §7/§18): renderBound/renderEachInto are fixed
  deterministic formatters, NOT an authored-formula evaluator. No `shape{name:formula}` engine.
- **Streaming-while-authoring**: authorCraft is one-shot (craft appears when ready), not SSE token-fill.
- **format:react**: no JSX compiler in deps.
- **Notion rich-text fidelity**: update-a-block REPLACES rich_text → multi-run formatting (bold/links)
  collapses to one plain run. Scoped to plain-text block types.
- **Persistence/auth/multi-user**: all sessions are in-memory globalThis (drop on restart).
- **Real external SaaS beyond what's wired**: only the connected MCP servers (GitHub/Notion/Linear/Slack).

---

## 6. Cleanup done (GitHub-ready) — user does git themselves
- `.gitignore` hardened: `.env`/`.env.local`/`.env*.local`, `mcp-workspace/`, `app-output/`,
  `tsconfig.tsbuildinfo`, `_*.mts` scratch, `.next`, `node_modules`, `.DS_Store`.
- VERIFIED no real token value leaks into any committable file (only in `.env`, gitignored).
- Deleted scratch docs (bidirectional-engine-plan.html, engine-api*.html, McpDeck.md, DEMO.md,
  TODO.md, "bidirectional UI.md") + .DS_Store + tsbuildinfo.
- README rewritten to match reality. `.env.local.example` has placeholders only.
- KEPT: memory/ (user chose include), README.md, TECHNICAL.md, all code.

## 7. ⚠️ SECURITY — OUTSTANDING USER ACTION
The user's `.env` contains REAL live tokens that appeared in this conversation transcript:
ANTHROPIC, OPENAI, GOOGLE, GROQ, GitHub PAT (ghp_…), Notion (ntn_…), Linear (lin_api_…),
Slack bot (xoxb-…). They are NOT in any committable file, but they ARE in the transcript →
**the user should ROTATE all of them.** (Also note SLACK_CHANNEL_IDS held an app id `A0B…` not a
channel id `C…` — a config nit.)

---

## 8. Env vars (see .env.local.example)
- `ANTHROPIC_API_KEY` (required for agent + craft authoring), GOOGLE/OPENAI/GROQ keys.
- `MCPDECK_SERVERS` (JSON array of real MCP stdio servers). Per-server creds:
  `GITHUB_PERSONAL_ACCESS_TOKEN`, `NOTION_TOKEN`, `LINEAR_API_TOKEN`,
  `SLACK_BOT_TOKEN`+`SLACK_TEAM_ID`+`SLACK_CHANNEL_IDS`.

## 9. Build/run
- `npm install`; `npm run dev` → http://localhost:3000 ; `npm run build` ; `npm start`.
- Win32 gotcha: stray `node`/`npx` processes from MCP server spawns can exhaust `spawn` and make
  `next build` fail with exit 127 / `spawn UNKNOWN`. Fix: `Get-Process node | Stop-Process -Force`
  then rebuild. tsc-clean + a retry build is the real signal of health.
- Test gotcha on win32: curl writing to `/tmp/x` lands at `D:\tmp\x` (node reads a different path) —
  use project-relative scratch files in test harnesses.

## 10. Memory (assistant's project notes — also committed)
`memory/MEMORY.md` indexes: repo-two-products-and-stale-readme, apps-real-fs-actions,
mcpdeck-real-saas, crafts-channel-subsystem, crafts-full-implementation. These carry the same
history at finer grain. NOTE: architecture_html_subagent.md + project_mini_bap_purpose.md describe
the DELETED widget chat — historical only.
