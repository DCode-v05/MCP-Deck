# McpDeck — Technical Document

A prototype that turns the AI from a request/response chatbot into a **persistent engine loop**
driving live, interactive UI. Data moves both ways **automatically**: live data polls *into*
already-rendered UI (no Refresh), and edits auto-save *back out* to real accounts (no Save).

The single surface is **McpDeck** at `/` (plus an app generator at `/generate`). Next.js 15 /
React 19 / TypeScript.

---

## 1. The core idea

A normal chatbot is **request → response**: you submit, it answers, the turn ends. This prototype
runs the UI *inside* the loop, so data moves both ways continuously:

| Flow | Meaning | Transport |
| --- | --- | --- |
| **UI → engine** | Every interaction (field edit, click) streams in as live state — not a new turn. Edits **auto-save**. | HTTP `POST` (upstream) |
| **Engine → UI** | The poll loop pushes fresh data into the *already-rendered* craft — no reload, no Refresh button. | SSE (downstream) |
| **Engine → real world** | In Agent mode, side-effecting tool calls pause for **human approval**. In crafts, edits write directly (auto-save, no modal). | approval gate / direct write |

Transport: **SSE down + HTTP POST up**, keyed by a server-side **session**.

---

## 2. The three loop primitives (Agent mode)

1. **Read state between iterations** — each iteration the engine pulls a live snapshot
   (enabled servers, pinned tools, open resources, recent results) and folds it into its system
   prompt; the same snapshot is what the UI rails render from.
   - Code: [`session.readContext()`](lib/mcpdeck/session.ts), [`engine.ts`](lib/mcpdeck/engine.ts).
2. **Pause-on-approval** — the engine generator suspends on `await session.awaitApproval(...)`
   and resumes only when the upstream `POST /input` resolves the pending promise. The user is the clock.
   - Code: [`session.awaitApproval()` / `resolveApproval()`](lib/mcpdeck/session.ts).
3. **Server-push into a live widget** — the session is a pub/sub bus; any state change emits an
   event the open SSE subscriber receives and the React reducer applies, with no new turn.
   - Code: `session.emit()` + the `useMcpDeck` reducer.

---

## 3. Session + transport architecture

```
┌─────────────── Browser ───────────────┐         ┌──────────── Next.js server ────────────┐
│ React hook (reducer over SSE events)   │         │  Session (in globalThis Map)            │
│   ├─ start ── POST goal ───────────────┼────────►│   ├─ event bus (subscribers)            │
│   ├─ resolveApproval ── POST /input ───┼────────►│   ├─ pendingApprovals: Map<id,Promise>  │
│   ├─ setField / toggle ── POST /input ─┼────────►│   ├─ state + readContext()              │
│   └─ ◄──────── SSE event stream ───────┼─────────┤   └─ usage / replay log                 │
└────────────────────────────────────────┘         └──────────────────────────────────────────┘
```

- Sessions live in a `globalThis` `Map` so Next.js HMR doesn't drop running loops in dev.
- The SSE route subscribes a writer and heartbeats every 15s; on disconnect it tears down.

---

## 4. McpDeck (the MCP control cockpit)

A live cockpit over MCP tool servers, at `/`. Two modes:

**Agent mode** — an LLM agent pursues a goal calling tools, **pausing for approval before each
call**. Surfaces ([`components/mcpdeck/`](components/mcpdeck/)): server panel (live health pings,
toggle mid-run), tool inspector (counts + last result, pin a tool), inflight approvals (editable
JSON args, approve / approve-and-remember / deny), resource browser, replay & branch, usage tab.

With **Live UI** on (default), submitting a request **authors a live craft** for it (see §6)
instead of running the plain agent loop.

**Apps mode** — read-only live dashboards per connected server (GitHub / Notion / Linear / Slack),
each bound to real tools through the shared channel poll loop (§5). `components/mcpdeck/apps/*`,
`lib/mcpdeck/apps/dashboards.ts`.

**API** ([`app/api/mcpdeck/`](app/api/mcpdeck/)): `start` (SSE), `stream` (reconnect),
`input` (upstream), `catalogue` (server/tool metadata), `generate` + `craft/run` (the `/generate`
studio).

---

## 5. The channel subsystem — the bidirectional core

One **shared server-side poll loop per asset**, fanned out to many subscribers (N crafts on one
asset = one poll, not N). SSE down, HTTP POST up, **no engine reasoning per data tick** — this is
what makes the UI auto-refresh on a short cadence with no Refresh button.

- [`lib/channels/`](lib/channels/) — `wire.ts` (protocol + frame encoder), `ref.ts` (channelKey),
  `channel.ts` (the poll loop + rev'd buffer + fan-out + `pollNow()`), `manager.ts` (lazy-create /
  ref-count / grace-drop + fan-in session), `sources.ts` (`pollSource` → real `callTool`).
- Routes: `app/api/channel/{subscribe, [sessionId]/stream, [sessionId]/refresh, request/[key], call}`.
- Client: [`lib/hooks/useChannel.ts`](lib/hooks/useChannel.ts).

The poll cadence is the tightest `poll_s` of all subscribers (floor 500ms). Authored crafts use a
short cadence (≤8s) so the view feels live.

---

## 6. Crafts — the engine authors live UI

In Agent mode with Live UI on, you describe what you want and the engine authors ONE `<craft>` tag:
sanitized interactive HTML bound to real MCP tools, plus a `<craft-live>` JSON sidecar of
`subscribe[]` (data IN) and `actions[]` (data OUT).

- [`lib/crafts/craft-block.ts`](lib/crafts/craft-block.ts) — the `CraftBlock` envelope +
  `sanitizeCraftHtml` (strips script/iframe/on*/javascript:, keeps `<template>`/`<input>`/`data-*`).
- [`lib/crafts/craft-parser.ts`](lib/crafts/craft-parser.ts) — streaming, split-token-safe `<craft>` parser.
- [`lib/crafts/authoring.ts`](lib/crafts/authoring.ts) — two-phase authoring: **resolveIds**
  (run read tools for real page/project ids) → **author** (bind drill-in tools to those ids).
  `validateLive` drops un-pollable subscriptions; the prompt forbids fabricated data and
  **forbids Save/Refresh buttons** (edits auto-save, reads auto-poll).
- [`components/crafts/CraftRenderer.tsx`](components/crafts/CraftRenderer.tsx) — the single renderer:
  - **Live data in** — fills `[data-craft-bind]`; an editable list uses `<template data-craft-each>`
    cloned per streamed row, each field pre-filled from the row (`.value` property, never innerHTML),
    stamped with its real runtime id.
  - **Auto-save out** — when a `[data-craft-input]` changes and the user pauses ~1s (or blurs), the
    matching `route:direct` write fires on its own: per-row writes inject that row's id (`idArg`) +
    scoped inputs; whole-craft writes (e.g. a page title) merge the craft's inputs. No Save button,
    no approval modal. Dirty-tracked via `data-craft-committed` so polling re-fills never trigger a write.
  - **route:engine** actions resume the thread (`/api/execute`) and re-author `version+1`.
- Routes: `app/api/crafts/author`, `app/api/execute`.

### The `/generate` studio
A separate prompt→app generator ([`CraftStudio.tsx`](components/mcpdeck/CraftStudio.tsx),
[`lib/mcpdeck/craft.ts`](lib/mcpdeck/craft.ts) + `craft-session.ts` + `generate.ts`): the LLM
authors a validated **craft spec** bound to live tools; read-only data sources render themed blocks,
action buttons run via `POST /api/mcpdeck/craft/run`.

---

## 7. Real MCP integration

McpDeck runs on a **provider abstraction** so session/engine/UI are agnostic to where tools come from.

- [`lib/mcpdeck/provider.ts`](lib/mcpdeck/provider.ts) — `McpProvider` interface + a **mock**
  provider (built-in `git`/`linear`) and a `getMcpProvider()` selector.
- [`lib/mcpdeck/real-client.ts`](lib/mcpdeck/real-client.ts) — connects to **real** MCP servers over
  stdio via `@modelcontextprotocol/sdk`, discovers tools/resources dynamically, routes
  `callTool`/`listResources` back through the live connection. Hardened for win32 (`npx.cmd`),
  credential pre-check (skips a server whose token is absent), parallel connect + timeout, and a
  broad `hasSideEffect` heuristic so all mutating tools are flagged.
- Config via `MCPDECK_SERVERS` (JSON array of `{ id, name, command, args }`). No config → mock.
  Connection failure → graceful fallback to mock. `GET /api/mcpdeck/catalogue` reports
  `kind: "mock" | "real"`. Wired for GitHub / Notion / Linear / Slack.

---

## 8. File map

```
app/
├── page.tsx                       # McpDeck (the only surface)
├── generate/page.tsx              # app generator (studio)
└── api/
    ├── mcpdeck/{start,stream,input,catalogue,generate}/route.ts
    ├── mcpdeck/craft/run/route.ts
    ├── channel/{subscribe,[sessionId]/stream,[sessionId]/refresh,request/[key],call}/route.ts
    └── crafts/author/route.ts , execute/route.ts
components/
├── mcpdeck/ (McpDeckPanel, ServerPanel, ToolInspector, ActivityStream,
│             InflightApprovalCard, ResourceBrowser, ReplayTimeline,
│             UsageDashboard, CraftStudio, apps/*)
└── crafts/CraftRenderer.tsx
lib/
├── mcpdeck/ (types, catalogue, tool-runner, session, engine, provider,
│             real-client, craft, craft-session, generate, apps/dashboards, sample-goals)
├── channels/ (wire, ref, channel, manager, sources)
├── crafts/ (craft-block, craft-parser, thread-store, authoring)
├── hooks/ (useMcpDeck, useChannel, useCraft, useCraftAuthor, useServerDashboard)
└── engine/providers/ (anthropic, openai, google)
```

---

## 9. Running it

```bash
npm install
npm run dev            # http://localhost:3000
```

- `ANTHROPIC_API_KEY` (`.env`) is required for the agent + craft authoring.
- Entry points: `/` (McpDeck), `/generate` (app generator). Old `/apps*` and `/mcpdeck*` paths redirect to these.

---

## 10. Status & limitations

| Area | Status |
| --- | --- |
| 3 loop primitives | ✅ implemented + verified |
| McpDeck (Agent + Apps) | ✅ live |
| Channel poll-loop fan-out (auto-refresh) | ✅ verified |
| Crafts: engine authors live UI, auto-save edits | ✅ verified (real Notion/GitHub/Linear writes) |
| Real MCP (GitHub/Notion/Linear/Slack) | ✅ via `MCPDECK_SERVERS` |
| Engine generates app from prompt (`/generate`) | ✅ verified against MCP |
| shape/trigger DSL, streaming-while-authoring, format:react | ⚠️ deferred |
| Persistence / multi-user | ⚠️ in-memory sessions (globalThis) |

---

## 11. Extending

- **Add a real MCP server**: append to `MCPDECK_SERVERS`. Tools/resources are discovered automatically.
- **Tune the craft author**: edit the prompt rules in [`authoring.ts`](lib/crafts/authoring.ts).
- **Extend the generator**: widen the craft spec in [`craft.ts`](lib/mcpdeck/craft.ts) + the prompt
  in [`generate.ts`](lib/mcpdeck/generate.ts).
