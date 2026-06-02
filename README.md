# Bidirectional Interactive UI

A Next.js 15 / React 19 / TypeScript prototype that turns an AI from a request→response
chatbot into a **persistent engine loop driving live, interactive apps**. Data moves
both ways continuously: your input streams into the loop, the loop pushes results back
into already-rendered UI, and real-world actions pause for your approval.

It connects to **real MCP servers** (filesystem, GitHub, Notion, Linear, Slack) and the
engine can **author live, interactive UI ("crafts")** bound to those real tools — including
editable fields that write back to your connected accounts.

---

## Quick start

```bash
npm install
cp .env.local.example .env.local   # then fill in your keys (see below)
npm run dev                        # http://localhost:3000
```

Open **`/apps`** for the launcher, or jump to a surface:

| Surface | URL | Needs a key? |
|---|---|---|
| Connector directory | `/apps` | no |
| 18 live "kit" apps | `/apps/<id>` | no (deterministic) |
| Tillpoint (checkout) | `/apps/tillpoint` | no (optional Stripe **test** key) |
| McpDeck (live MCP agent + crafts) | `/apps/mcpdeck` | yes — `ANTHROPIC_API_KEY` |
| Channels demo (shared poll-loop fan-out) | `/channels` | no |

---

## What's inside

### 1. The channel subsystem — the bidirectional core
`lib/channels/*` + `app/api/channel/*`. One **shared server-side poll loop per asset**,
fanned out to many subscribers (50 dashboards on one asset = one poll, not 50). SSE down,
HTTP POST up. No engine reasoning per data tick. See `/channels` for a live fan-out demo.

### 2. Crafts — the engine authors live UI
`lib/crafts/*` + `components/crafts/CraftRenderer.tsx`. In McpDeck's **Agent** mode with
"Live UI" on, you describe what you want and the engine authors a `<craft>` — sanitized
interactive HTML **bound to real MCP tools**:
- **Live data in** — `data-craft-bind` / `data-craft-each` fill from a channel each tick.
- **Editable rows** — list items render as fields pre-filled from live data; Save writes
  that row back to the SaaS using its own runtime id (approval-gated).
- **Actions out** — `route:direct` (mechanical tool call) or `route:engine` (resume the
  thread, re-author `version+1`).

### 3. McpDeck — the MCP control cockpit
`/apps/mcpdeck`. An LLM agent pursues a goal calling real MCP tools, **pausing for your
approval before each call**. **Apps** mode shows read-only live dashboards per connected
server. Connects to real servers via `MCPDECK_SERVERS`; falls back to a built-in mock.

### 4. The 18 "kit" apps + Tillpoint
`lib/apps/*`. Each is a config (`fields` + deterministic `compute` + one approval-gated
`action`) on one shared engine. Actions write **real files** through a real MCP filesystem
server. Tillpoint adds a real Stripe **test-mode** charge.

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
- `STRIPE_SECRET_KEY` — optional, **test key only** (`sk_test_…`); live keys are refused.

> **Secrets never get committed:** `.env` / `.env.local` are gitignored. Only
> `.env.local.example` (placeholders) is tracked.

---

## Architecture notes

A deeper write-up of the loop primitives, sessions, and transport lives in
[`TECHNICAL.md`](TECHNICAL.md).

## Status

Prototype. In-memory sessions (no persistence/auth). Writes through MCP are **real** —
approving an edit really changes your connected account.
