---
name: project-mini-bap-purpose
description: Mini-bap is a prototype destined to become a Subagent/Skill inside the main BAP product, adding interactive widget responses on top of BAP's current plain-text-only output.
metadata:
  type: project
---

**Mini-bap's role:** Prototype for an interactive-widget response capability that will be integrated into the main BAP product as a **Subagent or Skill** (Deni said "Subagent (or Skill)" — exact integration shape is still open as of 2026-05-12).

**Main BAP product** lives at `D:\Deni\Mr.Tech\Experience\Internships\September Platforms\Production\BAP Product\Code\` and is split into three components:
- `bap-backend`
- `bap-web`
- `bap-engine`

**Why this exists:** Today, BAP only generates **plain-text** responses. Mini-bap proves out the typed-widget streaming pattern (directive grammar, parser state machine, `Block[]` reducer, typed renderer registry, SSE wire format) in isolation so it can be lifted into the production codebase.

**Why:** Plain-text replies are the constraint Deni is trying to lift in BAP. The architecture work in mini-bap is meant to be lifted into the production codebase, not just demoed.

**How to apply:** When working in mini-bap, treat it as a reference implementation that needs to **port cleanly** into bap-engine / bap-web / bap-backend — favor stable contracts (the SSE event types, the `WidgetEnvelope` shape, the directive grammar) over prototype-only conveniences. When suggesting changes, ask whether the change is destined for the main product or stays prototype-local. See [[user-profile]] for context on Deni.
