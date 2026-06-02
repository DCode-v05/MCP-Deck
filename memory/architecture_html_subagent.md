---
name: architecture-html-subagent
description: Mini-bap is an HTML-widget subagent. Agentic 2-tool loop (build_widget, submit_widget) across 7 models, 30 widget skills (22 base + 8 v3 additions). Script + form allowed for interactive widgets.
metadata:
  type: project
---

# Mini-BAP — current state

A UI-development subagent that produces ONE interactive HTML widget per user turn. In production, the main BAP engine delegates to it with a payload; in the prototype, the user prompt IS the payload.

## The loop

Two tools, one phase each:

| # | Tool | What it does | Terminal? |
|---|---|---|---|
| 1 | `build_widget(intent)` | HTML-free pre-flight. Returns the chosen skill's design note + skill-specific reminders (script safety, attrs, etc). | No |
| 2 | `submit_widget(intent, html, prose?)` | Validates intent + HTML structure + script safety in one pass. If valid → renders + ends the loop. If invalid → returns `{valid:false, issues}` for the agent to fix and call again. | **Yes (if valid)** |

`MAX_ITERATIONS = 8` in [[lib/engine/run-engine.ts]] is the safety cap.

## Widget catalog (30 skills)

Source of truth is the [[lib/engine/skills/]] directory — one subdir per intent containing `SKILL.md` (frontmatter: name/description/family/needs_interactivity/keywords/reminders + design-note body) and `examples/sample.html`. [[lib/engine/tools/widget-library.ts]] is now a thin disk loader (synchronous `readdirSync` at module init, minimal frontmatter parser) that exposes the same `WIDGET_INTENTS` / `getSkill` / `listSkills` API — adding a widget = create the directory, no code edit.

| Family (engine taxonomy) | Skills |
|---|---|
| Static | chips · decision_card · confirm_card · stepper · checklist · timeline · table · chart · source_cards · inline_banner · form (visual-only, no real `<form>`) |
| Static + script | code_block (clipboard-Copy IIFE) |
| Diagrams | flowchart · venn_diagram · mind_map · sequence_diagram · tree_diagram · gantt_chart · map (treated as spatial diagram) |
| Charts | pie_chart · heatmap · scatter_plot · funnel_chart · radar_chart |
| Dashboards | kpi_dashboard · profile_card · kanban_board · pricing_table |
| Interactive (script ± form) | calculator · quiz |

The system prompt SKILL CATALOG section in [[lib/engine/system-prompt-freeform.ts]] also surfaces a "Spatial" line for `map` so the agent's mental model includes geographic intent (the on-disk `family` field stays `diagram` — family drives script reminders only, not catalog presentation).

## Providers ([[lib/engine/providers/]])

All implement `AgentTurnInvoker` — same normalized interface, native translation per API:

- **Anthropic** (Sonnet 4.6, Haiku 4.5) — beta promptCaching messages with `cache_control: ephemeral` on the system prompt
- **OpenAI** (GPT-5.4 Mini, 5.4, 5.5) — Responses API (`/v1/responses`), `reasoning.effort: "none"`. Chat completions rejects `reasoning_effort` + `tools` on GPT-5, so we use Responses. GPT-5 vocabulary is `none/low/medium/high/xhigh` — `minimal` is NOT accepted. SDK ^4.104 types only know low/medium/high; "none" sent via cast.
- **Google** (Gemini 3 Flash, 3.1 Flash Lite) — `functionDeclarations`; synthesizes call IDs (Gemini doesn't issue stable ones)

## Sanitizer + script-execution shim ([[components/output/HtmlBubble.tsx]])

DOMPurify config permits `<script>`, `<form>`, form controls. Stripped: `<iframe>`, `<style>`, `<object>`, `<embed>`, all `on*` handlers, `script src`, `form action/method`. `ALLOW_DATA_ATTR: true` so `data-role` and other model-emitted hooks survive.

The shim:
1. Owns the inner DOM manually via a ref (NOT `dangerouslySetInnerHTML`) — prevents React re-touching the inner DOM on parent re-renders and orphaning listeners
2. Sets `containerRef.current.innerHTML = clean` inside `useEffect` gated on `[clean]` (idempotent guard against StrictMode double-effect)
3. Rewrites `id="bap-w-X"` with a random per-instance suffix to prevent ID collisions across multiple widgets on one page
4. Clones each `<script>` into a fresh element so it executes (HTML5 spec: scripts inserted via innerHTML don't run)
5. Wraps the script body in `try/catch` so an in-script throw doesn't surface in the Next.js error overlay

## Validator ([[lib/engine/tools/validate.ts]])

Sanitizer-equivalent checks:
- Sentinels (`<!--bap-widget:start-->` / `<!--bap-widget:end-->`) present, exactly one widget block
- Forbidden tags, on* attributes, script src, form action/method
- Contrast rule: root must set `background` AND `color` inline
- Tag balance per-name (void/SVG-leaf elements: closes optional; non-void: must match exactly)
- Size cap: `MAX_WIDGET_BYTES = 12_000`
- Script safety: no fetch/XHR/WebSocket/eval/new Function/document.write
- `.value` vs `.textContent` mismatch detection (correlates `data-role` HTML elements to script variable bindings)
- **Click-target rule**: every widget must contain at least one `data-bap-prompt="..."` element OR — for `source_cards` only — an `<a href ... target="_blank">`. Pure-utility buttons (e.g. clipboard Copy) don't count.

## Interactivity convention

EVERY widget has a click target. Any element with `data-bap-prompt="follow-up message"` becomes one — the global click delegator in [[components/chat/ChatShell.tsx]] uses `target.closest("[data-bap-prompt]")` so all element types work: chip buttons, inline span keywords, whole-card click targets, table rows, list items, KPI tiles, kanban cards, SVG `<rect>`/`<circle>`/`<path>`/`<g>` (chart bars, pie slices, flowchart nodes, mind-map branches, venn labels), heatmap `<td>` cells, timeline events. For destructive actions, also add `data-bap-confirm`.

`source_cards` is the only widget that uses `<a href target="_blank" rel="noopener">` instead of `data-bap-prompt` — citations open in a new tab without leaving the chat. Validator enforces the rule (no `data-bap-prompt` AND no external anchor → submit rejected).

Pure-utility buttons (e.g. the clipboard Copy button in `code_block`) handle their action in-script and carry no `data-bap-prompt`; they coexist with a separate `data-bap-prompt` element elsewhere in the widget.

## SSE event schema

```
text_delta · tool_call · tool_result · widget_html · usage · error · done
```

## File layout

```
app/api/engine/execute/route.ts   SSE handler
lib/engine/
  run-engine.ts                   Loop orchestration (MAX_ITERATIONS=8)
  system-prompt-freeform.ts       Agent definition + skill catalog + design + example
  pricing.ts                      Cost computation per provider
  frontend-design-skill.ts        Optional Frontend Design Skill prepend
  providers/
    types.ts                      AgentTurnInvoker, TurnEvent, StopReason, UsageMetadata
    index.ts                      ProviderId, registry, getProvider
    anthropic.ts · openai.ts · google.ts
  tools/
    types.ts                      ToolDefinition, ToolCall, ToolResult, AgentMessage
    schemas.ts                    The 2 tool definitions
    widget-library.ts             Disk loader (synchronous readdirSync + minimal YAML frontmatter parser)
    validate.ts                   Structural + script safety + click-target enforcement
    executors.ts                  Tool dispatch (build_widget injects CLICK TARGET reminder per skill)
    index.ts                      Re-exports
  skills/                         22 skill packages: <intent>/SKILL.md + examples/sample.html
lib/hooks/useChat.ts              Client SSE parser
lib/types/engine-widgets.ts       TraceStep, EngineEvent, ChatMessage
components/output/
  HtmlBubble.tsx                  DOMPurify + script-execution shim
  AgentTrace.tsx                  Collapsible loop trace
  OutputSystem.tsx · InlineTextRenderer.tsx
components/chat/
  ChatShell.tsx                   Header + prompt library + chat list + input
  ChatMessage.tsx · ChatInput.tsx · ChatMessageList.tsx
  ModeSelector.tsx                Model dropdown + Skill toggle
  PromptLibrary.tsx               Slide-out drawer with demo prompts
  CostCalculator.tsx              Modal cost comparison
  EmptyState.tsx
```

## Design direction

[[lib/engine/system-prompt-freeform.ts]] OUTPUT CRAFT + DESIGN sections push for editorial-quality density without naming token targets:

- **Flat aesthetic** — no shadows, no gradients, no blur/backdrop, no translucent overlay fills. Hierarchy comes from color + weight + size + structure
- **Free palette per widget** — mood varies turn-to-turn (warm/cool/noir/paper/etc). BAP red `#EC3B4A` is the ONLY brand accent
- **Multiple sections per widget** — header strip, body, secondary panel, footer/metadata strip
- **3–6 inline SVG icons** per widget (check, arrow, chevron, dot, etc. with `stroke="currentColor"`)
- **4–6 typography sizes** for layered hierarchy
- **Borders + dividers liberally** — used throughout as the depth substitute

The widget should look like it BELONGS inside mini-bap's cream / espresso chat bubble.
