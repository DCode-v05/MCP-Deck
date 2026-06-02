# Bidirectional Interactive UI — Technical Document

A prototype that turns the AI from a request/response chatbot into a **persistent engine loop** driving live, interactive apps. This document describes what was built, how it works, and how to extend it.

All code lives under [`Interactive-Chatbot-Skills/`](Interactive-Chatbot-Skills/) (a Next.js 15 / React 19 / TypeScript app).

---

## 1. The core idea

A normal chatbot is **request → response**: you submit, it answers, the turn ends. This prototype makes the UI run *inside* the loop, so data moves both ways continuously:

| Flow                           | Meaning                                                                                                       | Transport                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **UI → engine**         | Every interaction (slider, toggle, field, click) streams in as live state — not a new turn.                  | HTTP `POST` (upstream)  |
| **Engine → UI**         | The loop recomputes derived values and pushes them into the*already-rendered* widget — no reload.          | SSE (downstream)          |
| **Engine → real world** | Side-effecting actions (payment, page, commit, tool call) pause for**human approval** before executing. | approval gate in the loop |

The transport is **SSE down + HTTP POST up**, keyed by a server-side **session**. This is the same transport family as the engine's existing `/execute` SSE and MCP's Streamable HTTP.

---

## 2. The three loop primitives

Everything is built on three reusable primitives:

1. **Read state between iterations** — at the top of every loop iteration the engine pulls a live snapshot of project/server state (enabled servers, pinned tools, open resources, recent results) and folds it into its system prompt. The *same* snapshot is what the UI rails render from, so rendering is directly connected to the engine state. In McpDeck this is visible as an `engine_thought` event between iterations.

   - Code: [`session.readContext()`](Interactive-Chatbot-Skills/lib/mcpdeck/session.ts), [`engine.ts`](Interactive-Chatbot-Skills/lib/mcpdeck/engine.ts).
2. **Pause-on-approval** — the engine generator suspends on `await session.awaitApproval(...)` and only resumes when the upstream `POST /input` resolves the pending promise. No timeout — the user is the clock.

   - Code: [`session.awaitApproval()` / `resolveApproval()`](Interactive-Chatbot-Skills/lib/mcpdeck/session.ts).
3. **Server-push into a live widget** — the session is a pub/sub bus; any state change (`recordToolCompletion`, `toggleServer`, a recompute) emits an event that the open SSE subscriber receives and the React reducer applies, mutating the relevant widget with no new turn.

   - Code: `session.emit()` + the `useMcpDeck` / `useLiveApp` reducers.

---

## 3. Session + transport architecture

```
┌─────────────── Browser ───────────────┐         ┌──────────── Next.js server ────────────┐
│ React hook (reducer over SSE events)   │         │  Session (in globalThis Map)            │
│   ├─ start ── POST goal ───────────────┼────────►│   ├─ event bus (subscribers)            │
│   ├─ resolveApproval ── POST /input ───┼────────►│   ├─ pendingApprovals: Map<id,Promise>  │
│   ├─ setField / toggle ── POST /input ─┼────────►│   ├─ state + readContext()              │
│   └─ ◄──────── SSE event stream ───────┼─────────┤   └─ usage / replay log                 │
│                                        │         │            │                            │
│  UI panels re-render from reducer      │         │            ▼ runs the loop / compute    │
└────────────────────────────────────────┘         └──────────────────────────────────────────┘
```

- Sessions are stored in a `globalThis` `Map` so Next.js HMR doesn't drop running loops in dev. (Production would back this with Redis/Postgres.)
- The SSE route subscribes a writer to the session and emits a heartbeat every 15s; on client disconnect it unsubscribes and tears down.
- The upstream `POST /input` routes a typed message (approval, field change, toggle, etc.) into the session.

---

## 4. App #1 — McpDeck (the MCP control cockpit)

A live cockpit over MCP-style tool servers. An LLM agent pursues a goal, calling tools, **pausing for your approval before each call**.

**Surfaces** ([`components/mcpdeck/`](Interactive-Chatbot-Skills/components/mcpdeck/)):

- **Server panel** — health pings (latency jitters live every 5s), toggle servers on/off mid-run.
- **Tool inspector** — every tool with invocation count + last-result preview; pin a tool to bias the agent.
- **Inflight approvals** — editable JSON args, approve / approve-and-remember / deny.
- **Resource browser** — lazy-load tree.
- **Replay & branch** — re-run a past call (optionally with edited args) or fork a new run from it.
- **Usage tab** — a subscription dashboard: request quota bar, token cost, approvals/denials, per-server data volume.
- **App Generator** (see §7).

**Engine loop** ([`lib/mcpdeck/engine.ts`](Interactive-Chatbot-Skills/lib/mcpdeck/engine.ts)): each iteration reads context → emits an `engine_thought` → builds the system prompt → streams a turn from the provider → before any tool call, `awaitApproval` → executes on approval → records to the replay log + usage.

**API** ([`app/api/mcpdeck/`](Interactive-Chatbot-Skills/app/api/mcpdeck/)): `start` (SSE), `stream` (reconnect), `input` (upstream), `catalogue` (server/tool metadata), `generate` + `craft/run` (§7).

---

## 5. Real MCP integration

McpDeck runs on a **provider abstraction** so the session/engine/UI are agnostic to where tools come from.

- [`lib/mcpdeck/provider.ts`](Interactive-Chatbot-Skills/lib/mcpdeck/provider.ts) — `McpProvider` interface + a **mock** provider (built-in `fs`/`git`/`linear`) and a `getMcpProvider()` selector.
- [`lib/mcpdeck/real-client.ts`](Interactive-Chatbot-Skills/lib/mcpdeck/real-client.ts) — connects to **real** MCP servers over stdio using `@modelcontextprotocol/sdk`, discovers their tools + resources dynamically, and routes `callTool` / `listResources` back through the live connection.
- Config via the `MCPDECK_SERVERS` env var (a JSON array of `{ id, name, command, args }`). No config → mock. Connection failure → graceful fallback to mock.

```bash
export MCPDECK_SERVERS='[{"id":"fs","name":"Filesystem","command":"npx",
  "args":["-y","@modelcontextprotocol/server-filesystem","/path/to/dir"]}]'
```

Verified end-to-end against the official `@modelcontextprotocol/server-filesystem` (read a real file) and `server-memory` (9 knowledge-graph tools discovered dynamically). `GET /api/mcpdeck/catalogue` reports `kind: "mock" | "real"`.

---

## 6. Apps #2–20 — the generic live-app kit

Rather than 18 bespoke pages, the remaining apps are **configs** on a shared engine.

- [`lib/apps/kit/types.ts`](Interactive-Chatbot-Skills/lib/apps/kit/types.ts) — an `AppDef` = `fields` (slider/stepper/toggle/text/select) + `compute(state)` (deterministic derived metrics — the engine→UI push) + one approval-gated `action` (the engine→real-world side effect) + optional `live` tick (continuous stream) + `samples` (preset scenarios).
- [`lib/apps/kit/registry.ts`](Interactive-Chatbot-Skills/lib/apps/kit/registry.ts) — all 18 apps (Verifly … Brewbench) as configs, plus `APP_META` (accent colour, icon, category) for theming.
- [`lib/apps/kit/session.ts`](Interactive-Chatbot-Skills/lib/apps/kit/session.ts) — one generic live session: holds state, runs `compute` on each change (server-push), gates the action behind approval, runs the optional live timer.
- [`components/apps/kit/LiveApp.tsx`](Interactive-Chatbot-Skills/components/apps/kit/LiveApp.tsx) — one themed renderer drives all 18 (per-app accent + icon, hero metric, metric tiles, sample chips, approval modal).
- Routes: dynamic [`/apps/[appId]`](Interactive-Chatbot-Skills/app/apps/[appId]/) + [`/api/apps/[appId]/{open,input}`](Interactive-Chatbot-Skills/app/api/apps/).

> Note: the kit apps use sliders/toggles/selects rather than literal drag-kanban/maps/spreadsheet grids. All three data flows are real; the *interaction modality* is simplified. **Pulsedash** additionally streams a synthetic live metric on a timer to demo continuous server-push.

**Tillpoint** (app #2) and **McpDeck** (app #1) are bespoke. The directory at [`/apps`](Interactive-Chatbot-Skills/app/apps/) is a connector-style launcher grouping all 20 by category.

---

## 7. The finale — the engine *generates* the app

The headline capability: you describe an app in plain English and the **engine authors it**, binds it to live MCP tools, and runs it — no hand-coding.

Flow:

1. `POST /api/mcpdeck/generate { prompt }` — the LLM is given the live MCP catalogue (servers + tools + input schemas) and a JSON output contract, and authors a **craft spec**.
2. [`lib/mcpdeck/craft.ts`](Interactive-Chatbot-Skills/lib/mcpdeck/craft.ts) validates/sanitises the spec against the provider — drops unknown tools, dangling block references, etc.
3. A sandboxed [`CraftSession`](Interactive-Chatbot-Skills/lib/mcpdeck/craft-session.ts) is created (only the tools the craft referenced may run).
4. The studio UI ([`CraftStudio.tsx`](Interactive-Chatbot-Skills/components/mcpdeck/CraftStudio.tsx)) fetches each **data source** (read-only tool calls → engine→UI) and renders themed blocks; **action buttons** (side-effect tools) run via `POST /api/mcpdeck/craft/run` behind an approval modal (engine→real world).

A craft spec is:

```jsonc
{
  "title": "...", "summary": "...", "accent": "#2E86C0",
  "dataSources": [ { "id": "...", "label": "...", "toolId": "<known tool>", "args": {...} } ],
  "blocks":      [ { "kind": "stat|table|list|source|text", "title": "...", "source": "<id>" } ],
  "actions":     [ { "id": "...", "label": "...", "toolId": "<known tool>", "args": {...} } ]
}
```

Verified: prompt *"a git dashboard with a button to create a release branch"* → engine authored a "Git Repository Overview" binding `git.status` + `git.log` with a `git.branch` action; data rendered live; the approved action created the branch; a tool *not* in the spec was rejected by the sandbox.

This is a pragmatic, robust slice of the broader "Crafts" spec — a declarative spec the LLM authors (vs. raw HTML), so the live binding is reliable enough to demo.

---

## 8. Chat ↔ MCP bridge

The original widget chat at [`/`](Interactive-Chatbot-Skills/app/page.tsx) is unchanged (LLM emits typed UI widgets one-shot). An **MCP ON/OFF toggle** in its header swaps the body for an embedded MCP console ([`McpInlineConsole.tsx`](Interactive-Chatbot-Skills/components/mcpdeck/McpInlineConsole.tsx)) — the agent calls MCP tools with inline approvals, reusing the McpDeck session/hook. (A full merge of MCP tool-calling into the widget *emitter* engine is the remaining deep item.)

---

## 9. File map

```
Interactive-Chatbot-Skills/
├── app/
│   ├── page.tsx                         # widget chat + MCP mode toggle
│   ├── apps/page.tsx                    # connector directory
│   ├── apps/[appId]/page.tsx            # 18 kit apps (dynamic)
│   ├── apps/tillpoint/page.tsx          # bespoke checkout
│   ├── mcpdeck/page.tsx                 # MCP cockpit
│   ├── mcpdeck/generate/page.tsx        # app generator (studio)
│   └── api/
│       ├── mcpdeck/{start,stream,input,catalogue,generate}/route.ts
│       ├── mcpdeck/craft/run/route.ts
│       └── apps/[appId]/{open,input}/route.ts , apps/tillpoint/{open,input}/route.ts
├── components/
│   ├── apps/ (AppsGallery, kit/LiveApp, kit/AppIcon, tillpoint/TillpointApp)
│   └── mcpdeck/ (McpDeckPanel, ServerPanel, ToolInspector, ActivityStream,
│                 InflightApprovalCard, ResourceBrowser, ReplayTimeline,
│                 UsageDashboard, McpInlineConsole, CraftStudio)
├── lib/
│   ├── mcpdeck/ (types, catalogue, tool-runner, session, engine, provider,
│   │             real-client, craft, craft-session, generate)
│   ├── apps/kit/ (types, registry, session) + apps/tillpoint/ (types, pricing, session)
│   ├── hooks/ (useMcpDeck, useLiveApp, useTillpoint, useCraft, useChat)
│   └── engine/providers/ (anthropic, openai, google — reused for generation)
└── scripts/demo-video.mjs               # Playwright captioned demo recorder
```

---

## 10. Running it

```bash
cd Interactive-Chatbot-Skills
npm install
npm run dev            # http://localhost:3000
```

- `ANTHROPIC_API_KEY` is read from `.env` — required for McpDeck's agent, the chat, and the app generator. The 20 apps + Tillpoint are deterministic and run **without** a key.
- Entry points: `/apps` (directory), `/apps/<id>` (any app), `/mcpdeck` (agent cockpit), `/mcpdeck/generate` (app generator), `/` (chat).
- Demo recording: `node scripts/demo-video.mjs` (server must be running) → `demo-video/bidirectional-ui-demo.webm`. See [DEMO.md](DEMO.md) for the live walkthrough script.

---

## 11. Status & limitations

| Area                                               | Status                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| 3 loop primitives                                  | ✅ implemented + verified                                         |
| McpDeck (all surfaces)                             | ✅ live                                                           |
| Real MCP (any stdio server)                        | ✅ via `MCPDECK_SERVERS`; tested on filesystem + memory servers |
| 20 apps                                            | ✅ all clickable + functional                                     |
| Engine generates app from prompt                   | ✅ verified against MCP                                           |
| Live server pings, replay, branch, usage           | ✅                                                                |
| Drag/canvas interaction fidelity (kanban/map/grid) | ⚠️ simplified to controls                                       |
| MCP merged into the widget*emitter* engine       | ⚠️ embedded console instead of full merge                       |
| Persistence / multi-user                           | ⚠️ in-memory sessions (globalThis)                              |

---

## 12. Extending

- **Add a kit app**: add one `AppDef` to [`registry.ts`](Interactive-Chatbot-Skills/lib/apps/kit/registry.ts) + a meta entry. No new routes or components.
- **Add a real MCP server**: append to `MCPDECK_SERVERS`. Tools/resources are discovered automatically.
- **Extend the generator**: widen the craft spec (new block kinds, `route:direct` vs `route:engine`, polling/`shape` formulas) in [`craft.ts`](Interactive-Chatbot-Skills/lib/mcpdeck/craft.ts) + the generation prompt in [`generate.ts`](Interactive-Chatbot-Skills/lib/mcpdeck/generate.ts).
