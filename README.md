# MCP Deck

## Project Description
MCP Deck is a Next.js 15 / React 19 / TypeScript prototype that reimagines the chatbot as a **persistent, autonomous agent that works across your real SaaS accounts and authors live, interactive UI as it goes**. Instead of a stateless request → response loop, you give it one terse, high-level goal and it runs a multi-step reasoning cycle across your connected tools (GitHub, Notion, Linear, Slack) as if they were a single knowledge graph. Reads run automatically; writes pause for your approval. And rather than answering only in prose, the agent can emit a **craft** — a live HTML panel bound to real MCP tools, where data polls in by itself and your edits save themselves back to your accounts. No Refresh button. No Save button.

---

## Project Details

### Problem Statement
A normal LLM chat is a one-shot transaction: you ask, it answers, the loop ends. That model breaks down the moment a task spans several apps, takes many steps, or needs to *stay live* after the answer arrives. MCP Deck breaks the chatbot model in three ways: it is an **agent** (a single goal kicks off a methodical operating cycle across multiple apps), it is **persistent** (the run lives in a server-side session that survives reloads and hot-reloads), and it drives **bidirectional, live UI** (data flows down by auto-polling and edits flow up by auto-saving, continuously, with no buttons in between).

### The Autonomous Agent
The agent lives in `lib/mcpdeck/engine.ts`. Its `runMcpDeck()` loop runs up to **`MAX_ITERATIONS = 20`** turns, driven by the `OPERATING_PROCEDURE` system prompt, which instructs it to treat all connected MCP servers as **one unified knowledge graph** and to run a fixed cycle for every goal:
- **ORIENT** — restate the terse goal as a working hypothesis; identify deliverables and which apps hold the starting node.
- **SURVEY** — discover via READ tools; follow cross-app pointers; resolve names to real IDs; seek disconfirming evidence.
- **PLAN** — infer the deliverable from observed data; state a short, ordered list of writes that leave the graph consistent.
- **ACT** — execute. WRITE tools pause for human approval; reads run automatically.
- **VERIFY** — re-read affected nodes to confirm the writes took effect.
- **FINISH** — call `finish` with a summary of concrete outcomes, or call `render_ui` first to emit a live panel.

Each turn, the engine snapshots live state via `session.readContext()`, folds it into the system prompt, streams one LLM turn, and processes the resulting tool calls. Robustness is built in: `callToolRobust()` enforces a per-tool wall-clock timeout of **`TOOL_TIMEOUT_MS = 45_000`** (reads retry once; writes never retry, to avoid duplicate side effects), and the 20-turn budget caps any run.

### Auto-Read, Approve-Write
Whether a tool is a read or a write is decided by a `hasSideEffect` flag, inferred for real MCP servers by a deliberately broad regex over the tool name (`write|create|delete|update|patch|send|set|put|^post|add|remove|move|rename|comment|archive|invite|merge|close|reopen|assign|upload|edit|destroy|cancel|approve|reject`). It over-flags by design — safer to ask one extra confirmation than to let a write slip through. **Reads** run immediately. **Writes** call `session.awaitApproval()` and block until you respond with `approve`, `approve_remember`, or `deny`, optionally editing the proposed args first.

### Crafts: Engine-Authored Live UI
When the agent calls `render_ui(description)`, `authorCraft()` (`lib/crafts/authoring.ts`) runs two phases — **resolve IDs** (run up to 3 read-only lookups to bind drill-in tools to *real* IDs) then **author** (stream one sanitized `<craft>` HTML tag plus a `<craft-live>` JSON sidecar). The craft is wired by `data-craft-*` attributes and rendered by `CraftRenderer` (`components/crafts/CraftRenderer.tsx`): data **polls in** (filling bound targets each tick via `textContent`/`.value`, never `innerHTML`), and edits **save out** (a ~1s debounce or blur fires a mechanical `route:direct` write — no approval modal). All authored HTML is sanitized (`<script>`, `<iframe>`, `<form>`, event handlers, and `javascript:` URLs are stripped).

### Channels: One Poll, Many Subscribers
The channel subsystem (`lib/channels/*`, `app/api/channel/*`) is the live-data backbone. A `Channel` is **one poll loop + a rev-stamped frame buffer + a subscriber set**, keyed by a deterministic hash of `{ provider, channel, args }`. Identical subscriptions hash identically and share one channel, so 50 crafts watching the same asset poll it **once**, not 50 times. Cadence is the tightest subscriber's `poll_s` (floored at 500ms); a channel is dropped **20s** after its last unsubscribe. Crucially, the engine does **not** reason per poll tick — there's no LLM call per data frame.

### The `/generate` Studio
`/generate` is a separate, one-shot "prompt → app" surface with **no agent loop**. You describe a dashboard in plain English and `generateCraft()` (`lib/mcpdeck/generate.ts`) emits a validated JSON **`CraftSpec`** of themed blocks (`stat | table | list | source | text`) bound to live tools. Unlike the agent's HTML crafts, studio data sources refresh on demand and write actions go through a per-action **approval modal** with editable JSON args. A sandboxed `CraftSession` enforces that only the tool IDs declared in the spec may execute.

### Real MCP Integration
MCP Deck runs on a provider abstraction (`lib/mcpdeck/provider.ts`, `real-client.ts`) so the engine and UI are agnostic to where tools come from. Set `MCPDECK_SERVERS` to a JSON array of stdio server configs to connect live GitHub / Notion / Linear / Slack servers; each server only starts if its required credential is present, connects in parallel under a 45s timeout, and is hardened for Windows (`npx`/`npm` resolve to their `.cmd` shims). With no servers configured, the app falls back to built-in **mock** servers (Git + Linear) returning synthesized responses.

### Web Application
MCP Deck has exactly **two live surfaces**:

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `McpDeckPanel` | The main cockpit. **Agent mode**: goal → autonomous multi-step run with a live "Model Processing" reasoning + tool trace, approval cards, and inline craft panels. **Apps mode**: read-only live dashboards per connected server. |
| `/generate` | `CraftStudio` | Prompt → app studio. One-shot `CraftSpec` (JSON) authoring, no agent loop. |

---

## Tech Stack
- Next.js 15.5 (App Router)
- React 19
- TypeScript 5.7 (strict)
- Tailwind CSS 3.4 + CSS variables (light/dark theme)
- lucide-react (icons)
- `@anthropic-ai/sdk`, `openai`, `@google/generative-ai` (multi-provider LLM)
- `@modelcontextprotocol/sdk` 1.29 (MCP over stdio)
- Playwright (testing)

---

## Getting Started

### 1. Clone the repository
```
git clone https://github.com/DCode-v05/MCP-Deck.git
cd MCP-Deck
```

### 2. Install dependencies
```
npm install
```

### 3. Configure environment
```
cp .env.local.example .env.local
```
Then edit `.env.local`. The only thing required to use the agent is an **`ANTHROPIC_API_KEY`**. To go live against real accounts, set `MCPDECK_SERVERS` (a JSON array of stdio MCP server configs) plus each server's credential on its own line (e.g. `GITHUB_PERSONAL_ACCESS_TOKEN`, `NOTION_TOKEN`, `LINEAR_API_TOKEN`, `SLACK_BOT_TOKEN` + `SLACK_TEAM_ID`). Leave `MCPDECK_SERVERS` unset to run on built-in mock servers.

### 4. Run the app
```
npm run dev          # → http://localhost:3000

# Production build
npm run build
npm start

# Lint
npm run lint
```

---

## Usage
- Open `http://localhost:3000` and, in **Agent mode**, type a terse cross-app goal (e.g. *"summarize the open Linear issues for the auth project into a Notion page"*). Watch the Model Processing trace as the agent surveys, plans, and acts; approve or edit any write it proposes.
- Ask the agent for a dashboard or control panel and it will **author a live craft** — data auto-polls in and your edits auto-save back to your accounts, with no Refresh or Save button.
- Switch to **Apps mode** to browse read-only live dashboards per connected server.
- Visit `/generate` to one-shot a JSON `CraftSpec` app from a plain-English description, with manual refresh and an approval modal for writes.
- Reopen or replay any past run from the history list, or branch a fresh run seeded with context you already gathered.

> **Note:** This is a prototype. All sessions and craft threads live in an in-memory `globalThis` registry — they survive page reloads and hot-reloads, but **everything is lost when the dev server restarts**. There is no database, auth, or multi-user support.

---

## Project Structure
```
MCP-Deck/
│
├── app/
│   ├── page.tsx                       # Root surface: McpDeckPanel
│   ├── generate/page.tsx              # Craft studio (prompt → app)
│   ├── layout.tsx  globals.css        # Shell + theme
│   └── api/
│       ├── mcpdeck/                   # Agent + session + studio routes
│       │   ├── start/  stream/  input/  catalogue/  history/
│       │   ├── generate/              # /generate authoring (CraftSpec JSON)
│       │   └── craft/run/             # /generate tool execution
│       ├── channel/                   # Bidirectional poll + push
│       │   ├── subscribe/
│       │   ├── [sessionId]/stream/  [sessionId]/refresh/
│       │   └── request/[key]/  call/
│       ├── crafts/author/             # Author a live HTML craft
│       └── execute/                   # route:engine resume (version+1)
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
│   └── crafts/CraftRenderer.tsx       # The live HTML-craft renderer (bind + auto-save)
│
├── lib/
│   ├── mcpdeck/                       # Agent + sessions + providers
│   │   ├── engine.ts                  # runMcpDeck loop, OPERATING_PROCEDURE, render_ui
│   │   ├── session.ts                 # McpDeckSession (SSE bus, approval gate, usage)
│   │   ├── types.ts                   # Event + upstream-message + state types
│   │   ├── provider.ts  real-client.ts# Provider abstraction + real MCP stdio client
│   │   ├── catalogue.ts  tool-runner.ts# Mock catalogue + mock tool execution
│   │   ├── craft.ts  generate.ts  craft-session.ts  # /generate studio
│   │   └── apps/dashboards.ts         # Apps-mode dashboard definitions
│   ├── channels/                      # One poll, many subscribers
│   │   └── channel.ts  manager.ts  ref.ts  wire.ts  sources.ts
│   ├── crafts/                        # Engine-authored live UI (HTML crafts)
│   │   └── authoring.ts  craft-block.ts  craft-parser.ts  thread-store.ts
│   ├── engine/
│   │   ├── providers/                 # anthropic.ts  google.ts  openai.ts  index.ts
│   │   └── tools/                     # provider-agnostic tool types
│   └── hooks/                         # useMcpDeck  useChannel  useCraft  useServerDashboard
│
├── next.config.ts  tsconfig.json  tailwind.config.ts  postcss.config.mjs
├── .env.local.example
└── README.md
```

---

## Contributing

Contributions are welcome! To contribute:
1. Fork the repository
2. Create a new branch:
   ```bash
   git checkout -b feature/your-feature
   ```
3. Commit your changes:
   ```bash
   git commit -m "Add your feature"
   ```
4. Push to your branch:
   ```bash
   git push origin feature/your-feature
   ```
5. Open a pull request describing your changes.

---

## Contact
- **GitHub:** [DCode-v05](https://github.com/DCode-v05)
- **Email:** denistanb05@gmail.com
