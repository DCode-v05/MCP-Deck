# MCP Deck

An agent that works across your GitHub, Notion, Linear and Slack accounts through MCP servers, and can build live UI panels that keep themselves in sync with those accounts.

I built it at September AI as one of their agentic-UI prototypes, to see what the Model Context Protocol changes about an assistant interface. It is an in-memory prototype with no database and no auth. The agent loop, write approvals, the channel subsystem and craft authoring all run, either against real accounts or built-in mock servers.

## What it does

- You give the agent a short goal, for example "summarise the open Linear issues for the auth project into a Notion page". It works through connected tools in a fixed cycle: orient, survey, plan, act, verify, finish.
- Read tools run on their own. Write tools stop at an approval card where you can approve, approve and remember, deny, or edit the arguments first.
- The agent can emit a "craft", an HTML panel bound to real tools. Data polls in, and edits save back to the account after a short debounce, with no refresh or save button.
- The run lives in a server-side session, so it survives a page reload.

## How it works

**Agent loop** (`lib/mcpdeck/engine.ts`). `runMcpDeck()` runs up to `MAX_ITERATIONS = 20` turns. The `OPERATING_PROCEDURE` system prompt tells the model to treat all connected servers as one graph and follow cross-app references (a repo name, an assignee, a ticket link) into the app that owns them. Each turn the engine folds the session state (enabled servers, pinned tools, recent results) into the prompt and streams one model turn. Besides the real MCP tools the model gets two synthetic ones, `render_ui` to emit a craft and `finish` to end the run.

**Tool calls.** `callToolRobust()` caps each call at `TOOL_TIMEOUT_MS = 45_000`. Reads retry once. Writes never retry, so a write can't repeat its side effect.

**Read or write.** For real MCP servers, a tool counts as a write if its name matches a deliberately broad regex (`write|create|delete|update|send|merge|archive...`). It over-flags on purpose, since an extra confirmation costs less than a missed write. Writes call `session.awaitApproval()` and block until you answer.

**Crafts** (`lib/crafts/authoring.ts`, `components/crafts/CraftRenderer.tsx`). `authorCraft()` first does up to 3 read-only lookups to bind the panel to real IDs, then streams a sanitised `<craft>` HTML tag with a `<craft-live>` JSON sidecar. `<script>`, `<iframe>`, `<form>`, inline event handlers and `javascript:` URLs are stripped. Bound values are written with `textContent` or `.value`, never `innerHTML`.

**Channels** (`lib/channels/`, `app/api/channel/`). A channel is one poll loop with a revision-stamped frame buffer and a set of subscribers, keyed by a hash of `{ provider, channel, args }`. Identical subscriptions share a channel, so fifty panels watching one resource poll it once. The poll interval follows the fastest subscriber with a 500 ms floor, and a channel is dropped 20 s after its last unsubscribe. There is no model call per poll.

**`/generate` studio** (`lib/mcpdeck/generate.ts`). A separate one-shot surface with no agent loop. `generateCraft()` turns a description into a validated JSON `CraftSpec` of blocks (`stat`, `table`, `list`, `source`, `text`) bound to tools. Data refreshes on demand, and writes go through an approval modal. `CraftSession` only lets tools declared in the spec run.

**Real servers or mocks** (`lib/mcpdeck/provider.ts`, `real-client.ts`). Set `MCPDECK_SERVERS` to a JSON array of stdio server configs. Each server starts only if its credential is present, and they connect in parallel under a 45 s timeout. On Windows it handles the `.cmd` shims for `npx` and `npm`. With nothing configured the app uses built-in mock `git` and `linear` servers.

**LLM providers.** Anthropic, OpenAI and Google adapters live in `lib/engine/providers/`.

| Route | Component | Purpose |
|---|---|---|
| `/` | `McpDeckPanel` | Agent mode with a live trace, approval cards and inline crafts, plus Apps mode with read-only dashboards per server |
| `/generate` | `CraftStudio` | Prompt to app studio |

## Stack

TypeScript, Next.js 15 (App Router), React 19, Tailwind CSS 3, `@modelcontextprotocol/sdk`, `@anthropic-ai/sdk`, `openai`, `@google/generative-ai`, Playwright (dev dependency), server-sent events for the agent stream.

## Setup

Needs Node 18+ and an LLM API key. `ANTHROPIC_API_KEY` is enough to drive the agent.

```bash
git clone https://github.com/DCode-v05/MCP-Deck.git
cd MCP-Deck
npm install
cp .env.local.example .env.local
npm run dev
```

Open http://localhost:3000. To use real accounts, set `MCPDECK_SERVERS` and the matching credentials in `.env.local` (`GITHUB_PERSONAL_ACCESS_TOKEN`, `NOTION_TOKEN`, `LINEAR_API_TOKEN`, `SLACK_BOT_TOKEN` with `SLACK_TEAM_ID`). `.env.local.example` has a sample config. The package names in it may differ from the MCP servers you have installed. Other scripts are `npm run build`, `npm start` and `npm run lint`.

## Project structure

```
app/                  pages (/ and /generate) and API routes
  api/mcpdeck/        agent session, stream, input, catalogue, history, generate, craft/run
  api/channel/        subscribe, call, request, per-session stream and refresh
  api/crafts/author/  live HTML craft authoring
components/mcpdeck/   panel, live trace, approval card, server panel, tool inspector, usage, studio, apps/
components/crafts/    CraftRenderer
lib/mcpdeck/          engine, session, provider, real MCP client, catalogue, generate studio
lib/channels/         channel, manager, wire, sources
lib/crafts/           authoring, craft block and parser, thread store
lib/engine/providers/ anthropic, google, openai
lib/hooks/            useMcpDeck, useChannel, useCraft, useServerDashboard
```

## Contact

Denistan B: [portfolio](https://www.denistan.me), [LinkedIn](https://www.linkedin.com/in/denistanb), denistanb05@gmail.com
