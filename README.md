# McpDeck — Bidirectional Interactive UI

A Next.js 15 / React 19 / TypeScript prototype that turns an AI from a request→response
chatbot into a **persistent engine loop driving live, interactive UI**. Data moves both
ways **continuously and automatically**: live data streams *into* already-rendered UI on a
poll loop (no Refresh button), and edits stream *back out* to your real accounts the moment
you make them (no Save button).

It connects to **real MCP servers** (GitHub, Notion, Linear, Slack) and the engine can
**author live, interactive UI ("crafts")** bound to those real tools — including editable
fields that **auto-save** to your connected accounts.

---

## Quick start

```bash
npm install
cp .env.local.example .env.local   # then fill in your keys (see below)
npm run dev                        # http://localhost:3000
```

| Surface | URL | Needs a key? |
|---|---|---|
| **McpDeck** (live MCP agent + crafts) | `/` | yes — `ANTHROPIC_API_KEY` |
| App generator (prompt → live craft) | `/generate` | yes — `ANTHROPIC_API_KEY` |

McpDeck has two modes:
- **Agent** — give it a goal; the agent pursues it calling real MCP tools, pausing for your
  approval before each call. With **Live UI** on (default), a request instead makes the engine
  **author a live craft** for it.
- **Apps** — read-only live dashboards per connected server (GitHub / Notion / Linear / Slack),
  each bound to real tools through the shared channel poll loop.

---

## What's inside

### 1. The channel subsystem — the bidirectional core
`lib/channels/*` + `app/api/channel/*`. One **shared server-side poll loop per asset**,
fanned out to many subscribers (50 dashboards on one asset = one poll, not 50). SSE down,
HTTP POST up, no engine reasoning per data tick. This is what makes the UI **auto-refresh**
on a short cadence with no Refresh button.

### 2. Crafts — the engine authors live UI
`lib/crafts/*` + `components/crafts/CraftRenderer.tsx`. In McpDeck's **Agent** mode with
"Live UI" on, you describe what you want and the engine authors a `<craft>` — sanitized
interactive HTML **bound to real MCP tools**:
- **Live data in** — `data-craft-bind` / `data-craft-each` fill from a channel each tick.
- **Editable rows** — list items render as fields pre-filled from live data; they
  **auto-save** that row back to the SaaS (using its own runtime id) ~1s after you stop
  typing, or on blur. No Save button, no approval modal.
- **Actions out** — `route:direct` (mechanical tool call) or `route:engine` (resume the
  thread, re-author `version+1`).

### 3. McpDeck — the MCP control cockpit
`/`. An LLM agent pursues a goal calling real MCP tools, **pausing for your approval before
each call**. Connects to real servers via `MCPDECK_SERVERS`; falls back to a built-in mock.

---

## Configuration (`.env` / `.env.local`)

See `.env.local.example` for the full list. Highlights:

- `ANTHROPIC_API_KEY` — required for McpDeck's agent + craft authoring.
- `MCPDECK_SERVERS` — JSON array of real MCP stdio servers. Each SaaS server only
  connects when its credential is present:
  - GitHub → `GITHUB_PERSONAL_ACCESS_TOKEN`
  - Notion → `NOTION_TOKEN` (share a page with the integration)
  - Linear → `LINEAR_API_TOKEN`
  - Slack → `SLACK_BOT_TOKEN` + `SLACK_TEAM_ID` + `SLACK_CHANNEL_IDS`

> **Secrets never get committed:** `.env` / `.env.local` are gitignored. Only
> `.env.local.example` (placeholders) is tracked.

---

## Architecture notes

A deeper write-up of the loop primitives, sessions, and transport lives in
[`TECHNICAL.md`](TECHNICAL.md).

## Status

Prototype. In-memory sessions (no persistence/auth). Writes through MCP are **real** —
editing a field really changes your connected account, automatically. There is no
per-edit confirmation, so connect accounts you're comfortable letting it write to.
