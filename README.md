# MCP Deck

**A persistent, autonomous agent that works across your real SaaS accounts (GitHub, Notion, Linear, Slack) and authors live, self-updating UI as it goes.**

![Next.js](https://img.shields.io/badge/Next.js_15-000000?style=flat&logo=nextdotjs&logoColor=white) ![React](https://img.shields.io/badge/React_19-20232A?style=flat&logo=react&logoColor=61DAFB) ![TypeScript](https://img.shields.io/badge/TypeScript_5.7-3178C6?style=flat&logo=typescript&logoColor=white) ![Tailwind CSS](https://img.shields.io/badge/Tailwind_3.4-06B6D4?style=flat&logo=tailwindcss&logoColor=white) ![MCP](https://img.shields.io/badge/Model_Context_Protocol-1.29-6E56CF?style=flat&logo=anthropic&logoColor=white) ![Anthropic](https://img.shields.io/badge/Anthropic-D97757?style=flat&logo=anthropic&logoColor=white) ![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=flat&logo=openai&logoColor=white) ![Google Gemini](https://img.shields.io/badge/Gemini-8E75B2?style=flat&logo=googlegemini&logoColor=white)

## Overview

MCP Deck reimagines the chatbot. A normal LLM chat is a one-shot transaction: you ask, it answers, the loop ends. That falls apart the moment a task spans several apps, takes many steps, or needs to *stay live* after the answer arrives.

MCP Deck breaks that model in three ways. It's an **agent** — one terse, high-level goal kicks off a methodical operating cycle across your connected tools. It's **persistent** — the run lives in a server-side session that survives page reloads and dev hot-reloads. And it drives **bidirectional, live UI** — instead of answering only in prose, the agent can emit a *craft*: a live HTML panel bound to real MCP tools, where data polls in by itself and your edits save themselves back to your accounts. No Refresh button. No Save button.

I built this during my AI engineering role at September AI (September Platforms), as one of a set of agentic-UI prototypes exploring how the Model Context Protocol changes what an assistant interface can be. It's an in-memory prototype — no database, no auth — but the agent loop, the approval gating, the channel subsystem, and the craft authoring are all fully wired and runnable against real GitHub / Notion / Linear / Slack accounts.

## Key Features

- **Autonomous cross-app agent.** A single terse goal (e.g. *"summarize the open Linear issues for the auth project into a Notion page"*) triggers a full reasoning cycle across every connected app, treated as one shared knowledge graph.
- **A fixed operating procedure** — ORIENT → SURVEY → PLAN → ACT → VERIFY → FINISH — encoded as the agent's system prompt, with a hard budget of 20 turns and exactly one tool call per turn.
- **Auto-read, approve-write gating.** Read tools run automatically; write tools pause for a human approval card where you can approve, approve-and-remember, deny, or edit the proposed arguments before they execute.
- **Engine-authored live crafts.** When the agent decides an editable panel beats prose, it authors a sanitized HTML craft whose data auto-polls in and whose edits auto-save out — with no buttons.
- **A channel subsystem** that deduplicates polling: identical data subscriptions share one poll loop, so 50 panels watching the same resource fetch it once, not 50 times.
- **A `/generate` studio** — a separate prompt → app surface that emits a validated JSON craft spec of themed blocks, with no agent loop.
- **Real MCP integration over stdio** — connect live GitHub / Notion / Linear / Slack MCP servers via a single JSON config, or fall back to built-in mock servers with no setup.
- **Multi-provider LLM backend** — Anthropic, OpenAI, and Google models behind one provider-agnostic agent interface.
- **A live reasoning trace** showing the agent's thinking, every tool call, approvals, and inline craft panels, plus a usage dashboard (tokens, cost, per-server metrics) and a searchable tool inspector.
- **Hardened tool execution** — per-tool wall-clock timeouts, one retry for reads, zero retries for writes (so a write never duplicates a side effect).

## How It Works

### The autonomous agent (`lib/mcpdeck/engine.ts`)

The core is `runMcpDeck()`, a loop that runs up to **`MAX_ITERATIONS = 20`** turns. It's driven by the `OPERATING_PROCEDURE` system prompt, which tells the model to treat all connected MCP servers as **one unified knowledge graph** — every page, issue, repo, PR, channel, or person is a *node*, and any cross-app reference inside a node (a repo name, an assignee, a file path, a ticket link) is a *pointer* to follow into the owning app.

Every goal runs as one forward cycle:

- **ORIENT** — restate the terse goal as a falsifiable hypothesis: what "done" concretely means, and which app holds the starting node.
- **SURVEY** — discover with read tools, follow cross-app pointers, resolve names to real IDs, and actively seek disconfirming evidence so a confident-but-wrong guess can't drive a write.
- **PLAN** — infer the deliverable from observed data (acceptance criteria, issue bodies, conventions) and state the smallest ordered list of writes that leaves the graph consistent.
- **ACT** — execute one write at a time, smallest scope first; every write pauses for approval; never clobber content the agent hasn't read.
- **VERIFY** — re-read each affected node to confirm the write landed.
- **FINISH** — call `finish` with a concrete summary (real IDs, links, what changed in each app), optionally calling `render_ui` first to emit a live panel.

Each turn, the engine snapshots live state via `session.readContext()` (enabled servers, pinned tools, opened resources, recent tool results), folds it into the system prompt, streams a single LLM turn, and processes the resulting tool calls. The model also gets two synthetic tools alongside the real MCP ones: `render_ui` (emit a live craft) and `finish` (terminate the run).

Tool execution is wrapped by `callToolRobust()`, which enforces a per-call wall-clock cap of **`TOOL_TIMEOUT_MS = 45_000`**. Reads retry once on failure; writes never retry, to avoid duplicate side effects. The 20-turn budget caps any run that starts to spiral.

### Auto-read, approve-write

Whether a tool is a read or a write is decided by a `hasSideEffect` flag. For real MCP servers it's inferred by a deliberately broad regex over the tool name:

```
/write|create|delete|update|patch|send|set|put|^post|add|remove|move|
rename|comment|archive|invite|merge|close|reopen|assign|upload|edit|
destroy|cancel|approve|reject/i
```

It over-flags on purpose — one extra confirmation is cheaper than letting a write slip through. Reads run immediately. Writes call `session.awaitApproval()` and block until you respond with `approve`, `approve_remember`, or `deny`, optionally editing the proposed arguments first via the `InflightApprovalCard`.

### Crafts: engine-authored live UI

When the agent calls `render_ui(description)`, `authorCraft()` (`lib/crafts/authoring.ts`) runs two phases — **resolve IDs** (up to 3 read-only lookups to bind drill-in tools to *real* IDs) then **author** (stream one sanitized `<craft>` HTML tag plus a `<craft-live>` JSON sidecar). The craft is wired by `data-craft-*` attributes and rendered by `CraftRenderer` (`components/crafts/CraftRenderer.tsx`):

- **Data polls in** — bound targets fill each tick via `textContent` / `.value`, never `innerHTML`.
- **Edits save out** — a ~1s debounce or a blur fires a mechanical write, no approval modal.

All authored HTML is sanitized: `<script>`, `<iframe>`, `<form>`, inline event handlers, and `javascript:` URLs are stripped before the craft ever reaches the DOM.

### Channels: one poll, many subscribers

The channel subsystem (`lib/channels/*`, `app/api/channel/*`) is the live-data backbone. A `Channel` is one poll loop + a rev-stamped frame buffer + a subscriber set, keyed by a deterministic hash of `{ provider, channel, args }`. Identical subscriptions hash identically and share one channel, so many crafts watching the same resource poll it once. Cadence follows the tightest subscriber's `poll_s` (floored at 500 ms); a channel is dropped 20 s after its last unsubscribe. Importantly, the agent does **not** reason per poll tick — there is no LLM call per data frame.

### The `/generate` studio

`/generate` is a separate one-shot "prompt → app" surface with no agent loop. You describe a dashboard in plain English and `generateCraft()` (`lib/mcpdeck/generate.ts`) emits a validated JSON `CraftSpec` of themed blocks (`stat | table | list | source | text`) bound to live tools. Unlike the agent's HTML crafts, studio data sources refresh on demand and writes go through a per-action approval modal with editable JSON args. A sandboxed `CraftSession` enforces that only the tool IDs declared in the spec may execute.

### Real MCP integration vs. mock fallback

The engine and UI sit on a provider abstraction (`lib/mcpdeck/provider.ts`, `real-client.ts`) so they don't care where tools come from. Set `MCPDECK_SERVERS` to a JSON array of stdio server configs and each server starts only if its required credential is present, connecting in parallel under a 45 s timeout. It's hardened for Windows, where `npx` / `npm` resolve to their `.cmd` shims. With no servers configured, the app runs on built-in mock servers (a `git` server with status/log/diff/branch and a `linear` server with list/read/create/comment) returning synthesized responses, so you can try the whole flow with zero credentials.

### The two surfaces

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `McpDeckPanel` | The main cockpit. **Agent mode**: goal → autonomous multi-step run with a live reasoning + tool trace, approval cards, and inline craft panels. **Apps mode**: read-only live dashboards per connected server. |
| `/generate` | `CraftStudio` | Prompt → app studio. One-shot `CraftSpec` (JSON) authoring, no agent loop. |

## Tech Stack

- **Language:** TypeScript 5.7 (strict)
- **Framework:** Next.js 15.5 (App Router), React 19
- **Styling:** Tailwind CSS 3.4 with CSS-variable light/dark theming; `lucide-react` icons
- **Agent / protocol:** `@modelcontextprotocol/sdk` 1.29 (MCP over stdio); custom operating-procedure agent loop
- **LLM providers:** `@anthropic-ai/sdk`, `openai`, `@google/generative-ai` behind one provider-agnostic interface
- **Live data:** server-sent events for the agent stream; a deduplicated channel/poll subsystem for craft data
- **Testing / tooling:** Playwright, ESLint, PostCSS

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- An LLM API key (an `ANTHROPIC_API_KEY` is enough to drive the agent)
- Optional: credentials for any real MCP servers you want to connect (GitHub PAT, Notion token, Linear API key, Slack bot token + team ID)

### Installation

```bash
git clone https://github.com/DCode-v05/MCP-Deck.git
cd MCP-Deck
npm install
```

### Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local`. The only thing required to use the agent is an `ANTHROPIC_API_KEY`. To go live against real accounts, set `MCPDECK_SERVERS` (a JSON array of stdio MCP server configs) plus each server's credential — for example `GITHUB_PERSONAL_ACCESS_TOKEN`, `NOTION_TOKEN`, `LINEAR_API_TOKEN`, `SLACK_BOT_TOKEN` + `SLACK_TEAM_ID`. Leave `MCPDECK_SERVERS` unset to run on the built-in mock servers.

### Running

```bash
npm run dev          # http://localhost:3000

# production build
npm run build
npm start

# lint
npm run lint
```

## Usage

- Open `http://localhost:3000` and, in **Agent mode**, type a terse cross-app goal. Watch the trace as the agent surveys, plans, and acts; approve or edit any write it proposes.
- Ask the agent for a dashboard or control panel and it will author a **live craft** — data auto-polls in, your edits auto-save back, no buttons.
- Switch to **Apps mode** to browse read-only live dashboards per connected server.
- Visit `/generate` to one-shot a JSON `CraftSpec` app from a plain-English description, with manual refresh and an approval modal for writes.
- Reopen or replay a past run from the history list, or branch a fresh run seeded with context you already gathered.

## Project Structure

```
MCP-Deck/
├── app/
│   ├── page.tsx                       # Root surface: McpDeckPanel
│   ├── generate/page.tsx              # Craft studio (prompt → app)
│   ├── layout.tsx  globals.css        # Shell + theme
│   └── api/
│       ├── mcpdeck/                   # Agent + session + studio routes
│       │   ├── start/ stream/ input/ catalogue/ history/
│       │   ├── generate/              # /generate authoring (CraftSpec JSON)
│       │   └── craft/run/             # /generate tool execution
│       ├── channel/                   # Bidirectional poll + push
│       │   ├── subscribe/  call/  request/[key]/
│       │   └── [sessionId]/stream/  [sessionId]/refresh/
│       ├── crafts/author/             # Author a live HTML craft
│       └── execute/                   # route:engine resume
│
├── components/
│   ├── mcpdeck/
│   │   ├── McpDeckPanel.tsx           # Root cockpit (mode switch, rails, composer)
│   │   ├── ModelProcessing.tsx        # Live trace: reasoning + tools + crafts
│   │   ├── InflightApprovalCard.tsx   # Editable-args approve/deny card for writes
│   │   ├── ServerPanel.tsx            # Server health + on/off toggles
│   │   ├── ToolInspector.tsx          # Searchable, pinnable tool list
│   │   ├── UsageDashboard.tsx         # Cost / tokens / per-server metrics
│   │   ├── CraftStudio.tsx            # /generate UI (CraftSpec, approval modal)
│   │   └── apps/                      # Apps-mode read-only dashboards + kit
│   └── crafts/CraftRenderer.tsx       # Live HTML-craft renderer (bind + auto-save)
│
├── lib/
│   ├── mcpdeck/                       # Agent + sessions + providers
│   │   ├── engine.ts                  # runMcpDeck loop, OPERATING_PROCEDURE, render_ui
│   │   ├── session.ts                 # McpDeckSession (SSE bus, approval gate, usage)
│   │   ├── provider.ts  real-client.ts# Provider abstraction + real MCP stdio client
│   │   ├── catalogue.ts  tool-runner.ts # Mock catalogue + mock tool execution
│   │   ├── craft.ts  generate.ts  craft-session.ts  # /generate studio
│   │   └── apps/dashboards.ts         # Apps-mode dashboard definitions
│   ├── channels/                      # One poll, many subscribers
│   │   └── channel.ts  manager.ts  ref.ts  wire.ts  sources.ts
│   ├── crafts/                        # Engine-authored live UI (HTML crafts)
│   │   └── authoring.ts  craft-block.ts  craft-parser.ts  thread-store.ts
│   ├── engine/providers/              # anthropic.ts  google.ts  openai.ts  index.ts
│   └── hooks/                         # useMcpDeck  useChannel  useCraft  useServerDashboard
│
├── next.config.ts  tsconfig.json  tailwind.config.ts  postcss.config.mjs
├── .env.local.example
└── README.md
```

---

## Contact

<table>
  <tr><td><b>Portfolio:</b> <a href="https://www.denistan.me">Denistan</a></td><td><b>LinkedIn:</b> <a href="https://www.linkedin.com/in/denistanb">denistanb</a></td></tr>
  <tr><td><b>GitHub:</b> <a href="https://github.com/DCode-v05">DCode-v05</a></td><td><b>LeetCode:</b> <a href="https://leetcode.com/u/Denistan_B">Denistan_B</a></td></tr>
  <tr><td colspan="2" align="center"><b>Email:</b> <a href="mailto:denistanb05@gmail.com">denistanb05@gmail.com</a></td></tr>
</table>

Made with ❤️ by **Denistan B**
