import type { AppDef, AppDefView, AppMeta, AppState, Metric } from "./types";

/**
 * Per-app identity — accent colour, icon, category, launcher blurb.
 * Kept separate from the behavioural AppDef so theming changes don't touch logic.
 * Includes the two bespoke apps (mcpdeck, tillpoint) so the launcher can theme them too.
 */
export const APP_META: Record<string, AppMeta> = {
  mcpdeck: { accent: "#EC3B4A", icon: "cable", category: "Dev & Infra", blurb: "Live MCP control cockpit" },
  tillpoint: { accent: "#1F9D57", icon: "cart", category: "Commerce", blurb: "Live checkout & payments" },
  verifly: { accent: "#2E8B57", icon: "shield-check", category: "Identity", blurb: "KYC onboarding & verification" },
  standup: { accent: "#5B6CD6", icon: "kanban", category: "Productivity", blurb: "Agent task board" },
  gridmind: { accent: "#0E8C7F", icon: "table", category: "Data & ML", blurb: "Live financial model" },
  pilotview: { accent: "#C0642E", icon: "globe", category: "Automation", blurb: "Headless browser cockpit" },
  hunkmate: { accent: "#7A4DD6", icon: "git", category: "Dev & Infra", blurb: "Diff-hunk code review" },
  roamline: { accent: "#2E86C0", icon: "map", category: "Travel", blurb: "Trip planner & booking" },
  draftloop: { accent: "#C2487E", icon: "pen", category: "Creative", blurb: "Document co-author" },
  whenly: { accent: "#B8902B", icon: "calendar", category: "Productivity", blurb: "Calendar negotiator" },
  riskpad: { accent: "#C0392E", icon: "trending", category: "Finance", blurb: "Position risk simulator" },
  tunestream: { accent: "#1DB954", icon: "music", category: "Creative", blurb: "Playlist builder" },
  stagecraft: { accent: "#6A5ACD", icon: "box", category: "Creative", blurb: "Render canvas" },
  stepwise: { accent: "#3E9C8F", icon: "list-checks", category: "Onboarding", blurb: "Adaptive setup wizard" },
  labelloop: { accent: "#B5733B", icon: "tags", category: "Data & ML", blurb: "Data labeling loop" },
  echoscript: { accent: "#8E44AD", icon: "mic", category: "Voice", blurb: "Voice transcript & intent" },
  pulsedash: { accent: "#2E9BC0", icon: "gauge", category: "Ops", blurb: "Live observability + alerts" },
  inboxpilot: { accent: "#4A6FD6", icon: "mail", category: "Productivity", blurb: "Email triage co-pilot" },
  castlist: { accent: "#C0642E", icon: "users", category: "HR", blurb: "Hiring shortlist" },
  brewbench: { accent: "#7A8C2E", icon: "flask", category: "Data & ML", blurb: "Prompt / eval playground" },
};

export function getAppMeta(id: string): AppMeta {
  return APP_META[id] ?? { accent: "#EC3B4A", icon: "sparkles", category: "Apps", blurb: "" };
}

// --- tiny helpers for concise compute functions ---
const n = (s: AppState, k: string, d = 0): number => (typeof s[k] === "number" ? (s[k] as number) : d);
const str = (s: AppState, k: string, d = ""): string => (typeof s[k] === "string" ? (s[k] as string) : d);
const bool = (s: AppState, k: string): boolean => s[k] === true;
const money = (x: number) => `$${x.toFixed(2)}`;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const m = (key: string, label: string, value: string, tone?: Metric["tone"], bar?: number): Metric => ({
  key,
  label,
  value,
  tone,
  bar,
});

// --- artifact helpers ---------------------------------------------------------
// Each app's action writes a REAL, format-appropriate file through the MCP
// filesystem server. A short id keeps repeated runs from clobbering each other;
// it's derived from current state so it's deterministic for the test harness.
function slug(s: string): string {
  return (s || "x").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 32) || "x";
}
function shortId(state: AppState): string {
  // deterministic, no Date.now/random (those break SSR/replay) — hash the state
  let h = 0;
  const str = JSON.stringify(state);
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36).slice(0, 6);
}
function metricLines(metrics: Metric[]): string {
  return metrics.map((mt) => `${mt.label}: ${mt.value}`).join("\n");
}
function metricCsv(metrics: Metric[]): string {
  return "metric,value\n" + metrics.map((mt) => `${csv(mt.label)},${csv(mt.value)}`).join("\n") + "\n";
}
function csv(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export const APP_DEFS: Record<string, AppDef> = {
  // 3 ─────────────────────────────────────────────────────────────────────
  verifly: {
    id: "verifly",
    samples: [
      { label: "Valid adult applicant", values: { name: "Ada Lovelace", birthYear: 1990, id: "AB-1234567", country: "US" } },
      { label: "Underage / incomplete", values: { name: "Sam", birthYear: 2015, id: "x9", country: "UK" } },
    ],
    name: "Verifly",
    tagline: "KYC / onboarding — live field validation, then an identity-provider verdict.",
    fields: [
      { key: "name", label: "Full name", kind: "text", default: "", placeholder: "Ada Lovelace" },
      { key: "birthYear", label: "Birth year", kind: "stepper", default: 1995, min: 1920, max: 2012, step: 1 },
      { key: "id", label: "Government ID", kind: "text", default: "", placeholder: "AB-1234567" },
      { key: "country", label: "Country", kind: "select", default: "US", options: ["US", "UK", "DE", "IN", "Other"] },
    ],
    compute: (s) => {
      const nameOk = str(s, "name").trim().split(/\s+/).length >= 2;
      const age = 2026 - n(s, "birthYear", 1995);
      const ageOk = age >= 18;
      const idOk = /^[A-Za-z]{2}-?\d{6,8}$/.test(str(s, "id").trim());
      const score = (nameOk ? 40 : 0) + (ageOk ? 35 : 0) + (idOk ? 25 : 0);
      return {
        metrics: [
          m("name", "Name", nameOk ? "valid" : "needs full name", nameOk ? "good" : "warn"),
          m("age", "Age", `${age} (${ageOk ? "ok" : "under 18"})`, ageOk ? "good" : "bad"),
          m("id", "ID format", idOk ? "valid" : "invalid", idOk ? "good" : "warn"),
          m("score", "Readiness", `${score}/100`, score === 100 ? "good" : "warn", score),
        ],
        note: score === 100 ? "All checks pass — ready to submit." : "Complete the fields to reach 100.",
        trigger: null,
      };
    },
    action: {
      label: "Submit for verification",
      confirmTitle: "Run identity check",
      confirmBody: (s) => `Send ${str(s, "name") || "applicant"}'s details to the identity provider?`,
      run: (s, mt) => {
        const age = 2026 - n(s, "birthYear", 1995);
        const ok = age >= 18 && str(s, "name").trim().split(/\s+/).length >= 2;
        if (!ok) return { ok: false, message: "Verification flagged — incomplete or underage applicant." };
        const name = str(s, "name");
        const record = {
          applicant: name,
          country: str(s, "country"),
          age,
          governmentId: str(s, "id"),
          verdict: "PASS",
          checks: mt.map((x) => ({ check: x.label, result: x.value })),
        };
        return {
          ok: true,
          message: `Verified ${name} (${str(s, "country")}). KYC passed.`,
          artifact: { filename: `kyc-${slug(name)}-${shortId(s)}.json`, content: JSON.stringify(record, null, 2) + "\n" },
        };
      },
    },
  },

  // 4 ─────────────────────────────────────────────────────────────────────
  standup: {
    id: "standup",
    samples: [
      { label: "Over WIP limit", values: { todo: 12, doing: 8, done: 5, wipLimit: 4 } },
      { label: "Healthy flow", values: { todo: 4, doing: 3, done: 20, wipLimit: 5 } },
    ],
    name: "Standup",
    tagline: "Agent task board — adjust column loads; the engine reprioritises and dispatches.",
    fields: [
      { key: "todo", label: "Todo", kind: "stepper", default: 6, min: 0, max: 30 },
      { key: "doing", label: "In progress", kind: "stepper", default: 3, min: 0, max: 12 },
      { key: "done", label: "Done", kind: "stepper", default: 11, min: 0, max: 99 },
      { key: "wipLimit", label: "WIP limit", kind: "slider", default: 4, min: 1, max: 10, step: 1 },
    ],
    compute: (s) => {
      const todo = n(s, "todo"), doing = n(s, "doing"), done = n(s, "done"), wip = n(s, "wipLimit", 4);
      const over = doing > wip;
      const total = todo + doing + done;
      const progress = total > 0 ? done / total : 0;
      return {
        metrics: [
          m("wip", "WIP", `${doing} / ${wip}`, over ? "bad" : "good", Math.min(100, (doing / wip) * 100)),
          m("backlog", "Backlog", `${todo} todo`, todo > 10 ? "warn" : "default"),
          m("progress", "Progress", pct(progress), "default", progress * 100),
        ],
        note: over ? "Over WIP limit — pull fewer, finish first." : "Healthy flow.",
        trigger: over ? "WIP limit exceeded — dispatch an agent to clear in-progress work." : null,
      };
    },
    action: {
      label: "Dispatch top task",
      confirmTitle: "Spawn sub-agent",
      confirmBody: (s) => `Spawn an agent to execute the top of ${n(s, "todo")} todo items?`,
      run: (s, mt) => {
        const todo = n(s, "todo");
        const ticket = [
          `# Dispatched task`,
          ``,
          `Picked the top item from a backlog of ${todo}.`,
          `Backlog after pickup: ${Math.max(0, todo - 1)}`,
          ``,
          `## Board snapshot`,
          metricLines(mt),
        ].join("\n") + "\n";
        return {
          ok: true,
          message: `Sub-agent spawned. ${todo} todo → ${Math.max(0, todo - 1)} after pickup.`,
          artifact: { filename: `dispatch-${shortId(s)}.md`, content: ticket },
        };
      },
    },
  },

  // 5 ─────────────────────────────────────────────────────────────────────
  gridmind: {
    id: "gridmind",
    samples: [
      { label: "Profitable model", values: { units: 2000, price: 60, cogs: 20, opex: 8000 } },
      { label: "Running a loss", values: { units: 300, price: 25, cogs: 22, opex: 8000 } },
    ],
    name: "Gridmind",
    tagline: "Live spreadsheet — edit cells, derived cells + margins recompute instantly.",
    fields: [
      { key: "units", label: "Units sold", kind: "stepper", default: 1200, min: 0, max: 100000, step: 50 },
      { key: "price", label: "Unit price", kind: "slider", default: 40, min: 1, max: 500, step: 1, unit: "$" },
      { key: "cogs", label: "Unit cost (COGS)", kind: "slider", default: 22, min: 1, max: 500, step: 1, unit: "$" },
      { key: "opex", label: "Monthly opex", kind: "slider", default: 8000, min: 0, max: 100000, step: 500, unit: "$" },
    ],
    compute: (s) => {
      const units = n(s, "units"), price = n(s, "price"), cogs = n(s, "cogs"), opex = n(s, "opex");
      const revenue = units * price;
      const grossProfit = units * (price - cogs);
      const netProfit = grossProfit - opex;
      const margin = revenue > 0 ? grossProfit / revenue : 0;
      return {
        metrics: [
          m("revenue", "Revenue", money(revenue)),
          m("gross", "Gross profit", money(grossProfit), grossProfit > 0 ? "good" : "bad"),
          m("net", "Net profit", money(netProfit), netProfit > 0 ? "good" : "bad"),
          m("margin", "Gross margin", pct(margin), margin > 0.4 ? "good" : margin > 0.2 ? "warn" : "bad", margin * 100),
        ],
        note: `Break-even at ${cogs < price ? Math.ceil(opex / (price - cogs)) : "∞"} units.`,
        trigger: netProfit < 0 ? "Net loss — raise price or cut opex before writing to Sheets." : null,
      };
    },
    action: {
      label: "Write to Sheets",
      confirmTitle: "Persist computed model",
      confirmBody: (_s, mt) => `Write the model (revenue ${mt.find((x) => x.key === "revenue")?.value}) to the connected spreadsheet?`,
      run: (s, mt) => {
        const rows = [
          "field,value",
          `units,${n(s, "units")}`,
          `unit_price,${n(s, "price")}`,
          `unit_cost,${n(s, "cogs")}`,
          `monthly_opex,${n(s, "opex")}`,
          ...mt.map((x) => `${csv(x.label)},${csv(x.value)}`),
        ].join("\n") + "\n";
        return {
          ok: true,
          message: `Model written to Sheets. Net ${mt.find((x) => x.key === "net")?.value}.`,
          artifact: { filename: `model-${shortId(s)}.csv`, content: rows },
        };
      },
    },
  },

  // 6 ─────────────────────────────────────────────────────────────────────
  pilotview: {
    id: "pilotview",
    samples: [
      { label: "Click the CTA", values: { url: "https://example.com", action: "click", selector: "button.cta", headless: true } },
      { label: "Extract prices", values: { url: "https://shop.example.com", action: "extract", selector: ".price", headless: true } },
    ],
    name: "Pilotview",
    tagline: "Browser cockpit — choose the next action; the engine drives the headless browser.",
    fields: [
      { key: "url", label: "Target URL", kind: "text", default: "https://example.com", placeholder: "https://…" },
      { key: "action", label: "Action", kind: "select", default: "click", options: ["click", "type", "scroll", "extract", "screenshot"] },
      { key: "selector", label: "Selector / text", kind: "text", default: "button.cta", placeholder: "CSS selector" },
      { key: "headless", label: "Headless", kind: "toggle", default: true },
    ],
    compute: (s) => {
      const valid = /^https?:\/\//.test(str(s, "url"));
      return {
        metrics: [
          m("url", "URL", valid ? "reachable" : "invalid", valid ? "good" : "bad"),
          m("plan", "Next step", `${str(s, "action")} → ${str(s, "selector") || "(page)"}`),
          m("mode", "Mode", bool(s, "headless") ? "headless" : "headed"),
        ],
        note: valid ? "Ready to drive the browser." : "Enter a valid http(s) URL.",
        trigger: null,
      };
    },
    action: {
      label: "Execute step",
      confirmTitle: "Fetch the page",
      confirmBody: (s) => `Make a real HTTP request to ${str(s, "url")} and save the response?`,
      // Pilotview does a REAL network side effect: fetch the URL and save the response.
      run: async (s) => {
        const url = str(s, "url");
        if (!/^https?:\/\//.test(url)) return { ok: false, message: "Enter a valid http(s) URL." };
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 10_000);
          const res = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
          clearTimeout(t);
          const body = await res.text();
          const headerDump = [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join("\n");
          const doc = [
            `# ${res.status} ${res.statusText}  ${url}`,
            ``,
            `## Headers`,
            headerDump,
            ``,
            `## Body (first 20 KB)`,
            body.slice(0, 20_000),
          ].join("\n");
          return {
            ok: res.ok,
            message: `Fetched ${url} → ${res.status} ${res.statusText} (${body.length} bytes).`,
            artifact: { filename: `fetch-${slug(url.replace(/^https?:\/\//, ""))}-${shortId(s)}.txt`, content: doc },
          };
        } catch (err) {
          return { ok: false, message: `Request failed: ${err instanceof Error ? err.message : String(err)}` };
        }
      },
    },
  },

  // 7 ─────────────────────────────────────────────────────────────────────
  hunkmate: {
    id: "hunkmate",
    samples: [
      { label: "Accept all hunks", values: { hunk1: true, hunk2: true, hunk3: true, hunk4: true } },
      { label: "Reject everything", values: { hunk1: false, hunk2: false, hunk3: false, hunk4: false } },
    ],
    name: "Hunkmate",
    tagline: "Code review — accept/reject diff hunks; the engine regenerates the rest.",
    fields: [
      { key: "hunk1", label: "Hunk 1 · auth guard", kind: "toggle", default: true },
      { key: "hunk2", label: "Hunk 2 · error handling", kind: "toggle", default: false },
      { key: "hunk3", label: "Hunk 3 · tests", kind: "toggle", default: true },
      { key: "hunk4", label: "Hunk 4 · refactor", kind: "toggle", default: false },
    ],
    compute: (s) => {
      const hunks = ["hunk1", "hunk2", "hunk3", "hunk4"];
      const accepted = hunks.filter((h) => bool(s, h)).length;
      const all = accepted === hunks.length;
      return {
        metrics: [
          m("accepted", "Accepted", `${accepted} / ${hunks.length}`, "default", (accepted / hunks.length) * 100),
          m("tests", "Tests", bool(s, "hunk3") ? "included" : "missing", bool(s, "hunk3") ? "good" : "warn"),
          m("ready", "Mergeable", all ? "yes" : "partial", all ? "good" : "warn"),
        ],
        note: bool(s, "hunk3") ? "Test hunk accepted — safe to merge." : "Consider accepting the tests hunk.",
        trigger: accepted === 0 ? "No hunks accepted — nothing to commit." : null,
      };
    },
    action: {
      label: "Commit + push",
      confirmTitle: "Commit accepted hunks",
      confirmBody: (s) => `Commit the ${["hunk1", "hunk2", "hunk3", "hunk4"].filter((h) => bool(s, h)).length} accepted hunks and push?`,
      run: (s) => {
        const labels: Record<string, string> = {
          hunk1: "auth guard", hunk2: "error handling", hunk3: "tests", hunk4: "refactor",
        };
        const accepted = ["hunk1", "hunk2", "hunk3", "hunk4"].filter((h) => bool(s, h));
        if (accepted.length === 0) return { ok: false, message: "Nothing to commit — accept at least one hunk." };
        const patch = [
          `Subject: [PATCH] apply ${accepted.length} reviewed hunk(s)`,
          ``,
          ...accepted.map((h, i) => `Hunk ${i + 1}: ${labels[h]} — accepted`),
          ``,
          `Committed to origin/main.`,
        ].join("\n") + "\n";
        return {
          ok: true,
          message: `Committed ${accepted.length} hunks. Pushed to origin/main.`,
          artifact: { filename: `commit-${shortId(s)}.patch`, content: patch },
        };
      },
    },
  },

  // 8 ─────────────────────────────────────────────────────────────────────
  roamline: {
    id: "roamline",
    samples: [
      { label: "Weekend foodie (fits)", values: { days: 3, budget: 2000, interest: "food", luxury: false } },
      { label: "2-week luxe (over budget)", values: { days: 14, budget: 3000, interest: "nightlife", luxury: true } },
    ],
    name: "Roamline",
    tagline: "Trip planner — tune days/budget/interests; POIs + cost refetch, then book.",
    fields: [
      { key: "days", label: "Days", kind: "slider", default: 4, min: 1, max: 21, step: 1 },
      { key: "budget", label: "Budget", kind: "slider", default: 1500, min: 200, max: 10000, step: 100, unit: "$" },
      { key: "interest", label: "Vibe", kind: "select", default: "food", options: ["food", "museums", "nature", "nightlife", "mixed"] },
      { key: "luxury", label: "Premium stays", kind: "toggle", default: false },
    ],
    compute: (s) => {
      const days = n(s, "days", 4), budget = n(s, "budget", 1500), lux = bool(s, "luxury");
      const nightly = lux ? 280 : 120;
      const lodging = nightly * days;
      const perDay = 90 + (str(s, "interest") === "nightlife" ? 60 : 0);
      const estCost = lodging + perDay * days + 350;
      const pois = days * (str(s, "interest") === "mixed" ? 4 : 3);
      const fits = estCost <= budget;
      return {
        metrics: [
          m("pois", "POIs planned", `${pois}`),
          m("cost", "Est. cost", money(estCost), fits ? "good" : "bad", Math.min(100, (estCost / budget) * 100)),
          m("fit", "Budget", fits ? `under by ${money(budget - estCost)}` : `over by ${money(estCost - budget)}`, fits ? "good" : "bad"),
        ],
        note: `${days}-day ${str(s, "interest")} trip, ${lux ? "premium" : "standard"} stays.`,
        trigger: fits ? null : "Over budget — shorten the trip or drop premium stays.",
      };
    },
    action: {
      label: "Book trip",
      confirmTitle: "Confirm bookings",
      confirmBody: (_s, mt) => `Book flights + hotels for ${mt.find((x) => x.key === "cost")?.value}?`,
      run: (s, mt) => {
        const fits = mt.find((x) => x.key === "fit")?.tone === "good";
        if (!fits) return { ok: false, message: "Booking blocked — over budget." };
        const cost = mt.find((x) => x.key === "cost")?.value ?? "";
        const itinerary = [
          `TRIP ITINERARY`,
          `==============`,
          `Duration:  ${n(s, "days")} days`,
          `Vibe:      ${str(s, "interest")}`,
          `Stays:     ${bool(s, "luxury") ? "premium" : "standard"}`,
          `Est. cost: ${cost}`,
          ``,
          metricLines(mt),
        ].join("\n") + "\n";
        return {
          ok: true,
          message: `Booked ${n(s, "days")}-day trip for ${cost}. Confirmation sent.`,
          artifact: { filename: `itinerary-${slug(str(s, "interest"))}-${shortId(s)}.txt`, content: itinerary },
        };
      },
    },
  },

  // 9 ─────────────────────────────────────────────────────────────────────
  draftloop: {
    id: "draftloop",
    samples: [
      { label: "Launch post", values: { topic: "Launch announcement", tone: "confident", length: 200, cta: true } },
      { label: "Technical deep-dive", values: { topic: "How the engine loop works", tone: "technical", length: 420, cta: false } },
    ],
    name: "Draftloop",
    tagline: "Doc co-author — set tone/length, edit the seed; the engine continues from it.",
    fields: [
      { key: "topic", label: "Section topic", kind: "text", default: "Launch announcement", placeholder: "what to write" },
      { key: "tone", label: "Tone", kind: "select", default: "confident", options: ["confident", "playful", "formal", "technical"] },
      { key: "length", label: "Target words", kind: "slider", default: 180, min: 40, max: 600, step: 20 },
      { key: "cta", label: "Include CTA", kind: "toggle", default: true },
    ],
    compute: (s) => {
      const words = n(s, "length", 180);
      const reading = Math.max(1, Math.round(words / 200));
      const paras = Math.max(1, Math.round(words / 70));
      return {
        metrics: [
          m("words", "Target", `${words} words`),
          m("read", "Reading time", `${reading} min`),
          m("shape", "Structure", `${paras} paragraphs${bool(s, "cta") ? " + CTA" : ""}`),
          m("tone", "Tone", str(s, "tone")),
        ],
        note: `Drafting "${str(s, "topic")}" in a ${str(s, "tone")} tone.`,
        trigger: null,
      };
    },
    action: {
      label: "Export to Notion",
      confirmTitle: "Export document",
      confirmBody: (s) => `Export "${str(s, "topic")}" (${n(s, "length")} words) to Notion?`,
      run: (s) => {
        const topic = str(s, "topic");
        const tone = str(s, "tone");
        const target = n(s, "length", 180);
        const paras = Math.max(1, Math.round(target / 70));
        const body = Array.from({ length: paras }, (_, i) =>
          `Paragraph ${i + 1} — drafting "${topic}" in a ${tone} tone. ` +
          `This section develops the argument toward the ${target}-word target.`,
        ).join("\n\n");
        const doc = `# ${topic}\n\n_Tone: ${tone} · target ${target} words_\n\n${body}\n${bool(s, "cta") ? "\n**Call to action:** Get started today.\n" : ""}`;
        return {
          ok: true,
          message: `Exported "${topic}" to Notion. Page created.`,
          artifact: { filename: `${slug(topic)}-${shortId(s)}.md`, content: doc },
        };
      },
    },
  },

  // 10 ────────────────────────────────────────────────────────────────────
  whenly: {
    id: "whenly",
    samples: [
      { label: "Quick 1:1", values: { duration: "30m", attendees: 2, earliest: 9, latest: 17 } },
      { label: "Big workshop (no slot)", values: { duration: "60m", attendees: 18, earliest: 14, latest: 16 } },
    ],
    name: "Whenly",
    tagline: "Calendar negotiator — set constraints; availability re-polls, then invite.",
    fields: [
      { key: "duration", label: "Duration", kind: "select", default: "30m", options: ["15m", "30m", "45m", "60m"] },
      { key: "attendees", label: "Attendees", kind: "stepper", default: 4, min: 2, max: 20 },
      { key: "earliest", label: "Earliest hour", kind: "slider", default: 9, min: 6, max: 18, step: 1, unit: "h" },
      { key: "latest", label: "Latest hour", kind: "slider", default: 17, min: 7, max: 22, step: 1, unit: "h" },
    ],
    compute: (s) => {
      const span = Math.max(0, n(s, "latest", 17) - n(s, "earliest", 9));
      const attendees = n(s, "attendees", 4);
      const slots = Math.max(0, span * 2 - Math.floor(attendees / 2));
      const conflicts = Math.max(0, attendees - 3);
      return {
        metrics: [
          m("slots", "Slots found", `${slots}`, slots > 0 ? "good" : "bad"),
          m("conflicts", "Conflicts", `${conflicts}`, conflicts > 4 ? "warn" : "default"),
          m("window", "Window", `${n(s, "earliest")}:00–${n(s, "latest")}:00`),
        ],
        note: slots > 0 ? `${slots} viable ${str(s, "duration")} slots across ${attendees} calendars.` : "No slots — widen the window.",
        trigger: slots === 0 ? "No common slot — widen the hours or drop an attendee." : null,
      };
    },
    action: {
      label: "Send invite",
      confirmTitle: "Lock the meeting",
      confirmBody: (s) => `Send a ${str(s, "duration")} invite to ${n(s, "attendees")} attendees?`,
      run: (s) => {
        const dur = str(s, "duration");
        const mins = parseInt(dur, 10) || 30;
        const earliest = n(s, "earliest", 9);
        const hh = String(earliest).padStart(2, "0");
        const endMin = mins % 60;
        const endHour = earliest + Math.floor(mins / 60);
        const id = shortId(s);
        // A genuinely valid .ics file — importable into any calendar app.
        const ics = [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "PRODID:-//mini-bap//Whenly//EN",
          "BEGIN:VEVENT",
          `UID:whenly-${id}@mini-bap`,
          "DTSTAMP:20260601T090000Z",
          `DTSTART:20260602T${hh}0000`,
          `DTEND:20260602T${String(endHour).padStart(2, "0")}${String(endMin).padStart(2, "0")}00`,
          `SUMMARY:Meeting (${dur}, ${n(s, "attendees")} attendees)`,
          `DESCRIPTION:Scheduled via Whenly. Window ${earliest}:00-${n(s, "latest")}:00.`,
          "END:VEVENT",
          "END:VCALENDAR",
        ].join("\r\n") + "\r\n";
        return {
          ok: true,
          message: `Invite sent to ${n(s, "attendees")} attendees (${dur}). Calendar holds placed.`,
          artifact: { filename: `invite-${id}.ics`, content: ics },
        };
      },
    },
  },

  // 11 ────────────────────────────────────────────────────────────────────
  riskpad: {
    id: "riskpad",
    samples: [
      { label: "Conservative long", values: { size: 10000, leverage: 2, stop: 5, side: "long" } },
      { label: "Aggressive (HIGH risk)", values: { size: 50000, leverage: 15, stop: 20, side: "short" } },
    ],
    name: "Riskpad",
    tagline: "Trading sim — nudge size/leverage/stop; risk + P&L recompute, then submit.",
    fields: [
      { key: "size", label: "Position size", kind: "slider", default: 10000, min: 500, max: 200000, step: 500, unit: "$" },
      { key: "leverage", label: "Leverage", kind: "slider", default: 3, min: 1, max: 25, step: 1, unit: "x" },
      { key: "stop", label: "Stop-loss", kind: "slider", default: 5, min: 1, max: 30, step: 1, unit: "%" },
      { key: "side", label: "Side", kind: "select", default: "long", options: ["long", "short"] },
    ],
    compute: (s) => {
      const size = n(s, "size", 10000), lev = n(s, "leverage", 3), stop = n(s, "stop", 5);
      const exposure = size * lev;
      const margin = size;
      const maxLoss = exposure * (stop / 100);
      const liqDist = 100 / lev;
      const risky = maxLoss > size * 0.5 || lev > 10;
      return {
        metrics: [
          m("exposure", "Exposure", money(exposure)),
          m("maxloss", "Max loss", money(maxLoss), maxLoss > size * 0.5 ? "bad" : "warn", Math.min(100, (maxLoss / margin) * 100)),
          m("liq", "Liq. distance", `${liqDist.toFixed(1)}%`, liqDist < 8 ? "bad" : "good"),
          m("risk", "Risk", risky ? "HIGH" : "moderate", risky ? "bad" : "good"),
        ],
        note: `${str(s, "side").toUpperCase()} ${money(exposure)} at ${lev}x, ${stop}% stop.`,
        trigger: risky ? "High risk — leverage or stop too aggressive." : null,
      };
    },
    action: {
      label: "Submit order",
      confirmTitle: "Place live order",
      confirmBody: (s, mt) => `Submit ${str(s, "side")} order, exposure ${mt.find((x) => x.key === "exposure")?.value}?`,
      run: (s, mt) => {
        const order = {
          side: str(s, "side"),
          size: n(s, "size"),
          leverage: n(s, "leverage"),
          stop: n(s, "stop"),
          exposure: mt.find((x) => x.key === "exposure")?.value,
          maxLoss: mt.find((x) => x.key === "maxloss")?.value,
          risk: mt.find((x) => x.key === "risk")?.value,
          status: "FILLED",
        };
        return {
          ok: true,
          message: `${str(s, "side").toUpperCase()} order filled. Exposure ${order.exposure}.`,
          artifact: { filename: `order-${slug(str(s, "side"))}-${shortId(s)}.json`, content: JSON.stringify(order, null, 2) + "\n" },
        };
      },
    },
  },

  // 12 ────────────────────────────────────────────────────────────────────
  tunestream: {
    id: "tunestream",
    samples: [
      { label: "Focus chill", values: { energy: 30, minutes: 90, genre: "jazz", explicit: false } },
      { label: "Workout hype", values: { energy: 90, minutes: 45, genre: "electronic", explicit: true } },
    ],
    name: "Tunestream",
    tagline: "Playlist builder — set vibe/length; the engine fills tracks, then saves.",
    fields: [
      { key: "energy", label: "Energy", kind: "slider", default: 60, min: 0, max: 100, step: 5, unit: "%" },
      { key: "minutes", label: "Length", kind: "slider", default: 60, min: 10, max: 240, step: 5, unit: "min" },
      { key: "genre", label: "Genre", kind: "select", default: "electronic", options: ["electronic", "indie", "hiphop", "jazz", "mixed"] },
      { key: "explicit", label: "Allow explicit", kind: "toggle", default: true },
    ],
    compute: (s) => {
      const minutes = n(s, "minutes", 60);
      const tracks = Math.round(minutes / 3.4);
      const energy = n(s, "energy", 60);
      const mood = energy > 70 ? "high-energy" : energy > 40 ? "balanced" : "chill";
      return {
        metrics: [
          m("tracks", "Tracks", `${tracks}`),
          m("dur", "Duration", `${minutes} min`),
          m("mood", "Mood", mood, "default", energy),
          m("genre", "Genre", str(s, "genre")),
        ],
        note: `${tracks}-track ${mood} ${str(s, "genre")} set.`,
        trigger: null,
      };
    },
    action: {
      label: "Save to Spotify",
      confirmTitle: "Save playlist",
      confirmBody: (_s, mt) => `Save the ${mt.find((x) => x.key === "tracks")?.value}-track playlist to Spotify?`,
      run: (s, mt) => {
        const tracks = Number(mt.find((x) => x.key === "tracks")?.value ?? 0);
        const genre = str(s, "genre");
        const mood = mt.find((x) => x.key === "mood")?.value ?? "set";
        // A real .m3u playlist file.
        const lines = ["#EXTM3U", `#PLAYLIST:${mood} ${genre} mix`];
        for (let i = 1; i <= tracks; i++) {
          lines.push(`#EXTINF:210,${genre} track ${i}`, `${genre}-track-${i}.mp3`);
        }
        return {
          ok: true,
          message: `Saved ${tracks} tracks to Spotify. Playlist live.`,
          artifact: { filename: `playlist-${slug(genre)}-${shortId(s)}.m3u`, content: lines.join("\n") + "\n" },
        };
      },
    },
  },

  // 13 ────────────────────────────────────────────────────────────────────
  stagecraft: {
    id: "stagecraft",
    samples: [
      { label: "Quick preview", values: { layers: 4, resolution: "720p", samples: 64, denoise: true } },
      { label: "8K hero (heavy)", values: { layers: 24, resolution: "8K", samples: 512, denoise: true } },
    ],
    name: "Stagecraft",
    tagline: "Render canvas — set layers/quality; the engine re-renders, then exports.",
    fields: [
      { key: "layers", label: "Layers", kind: "stepper", default: 8, min: 1, max: 64 },
      { key: "resolution", label: "Resolution", kind: "select", default: "1080p", options: ["720p", "1080p", "4K", "8K"] },
      { key: "samples", label: "Samples", kind: "slider", default: 128, min: 16, max: 1024, step: 16 },
      { key: "denoise", label: "Denoise", kind: "toggle", default: true },
    ],
    compute: (s) => {
      const res = { "720p": 1, "1080p": 2.25, "4K": 9, "8K": 36 }[str(s, "resolution", "1080p")] ?? 2.25;
      const samples = n(s, "samples", 128), layers = n(s, "layers", 8);
      const renderMs = Math.round(res * samples * layers * (bool(s, "denoise") ? 1.2 : 1) * 0.6);
      const sizeMb = (res * layers * 0.4).toFixed(1);
      return {
        metrics: [
          m("time", "Render time", `${(renderMs / 1000).toFixed(1)}s`, renderMs > 8000 ? "warn" : "good"),
          m("size", "Output size", `${sizeMb} MB`),
          m("quality", "Quality", `${str(s, "resolution")} · ${samples} spp`),
        ],
        note: `${layers} layers at ${str(s, "resolution")}.`,
        trigger: renderMs > 12000 ? "Heavy render — lower samples or resolution." : null,
      };
    },
    action: {
      label: "Export render",
      confirmTitle: "Render + export",
      confirmBody: (s) => `Render ${n(s, "layers")} layers at ${str(s, "resolution")} and export to file?`,
      run: (s) => {
        const layers = n(s, "layers", 8);
        // A real, openable .svg standing in for the rendered frame.
        const rects = Array.from({ length: Math.min(layers, 24) }, (_, i) => {
          const hue = Math.round((360 / Math.min(layers, 24)) * i);
          return `  <rect x="${10 + i * 6}" y="${10 + i * 4}" width="180" height="120" rx="8" fill="hsl(${hue} 70% 55% / 0.5)"/>`;
        }).join("\n");
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">\n  <rect width="320" height="240" fill="#1a1714"/>\n${rects}\n  <text x="16" y="228" fill="#fff" font-family="monospace" font-size="12">${str(s, "resolution")} · ${layers} layers</text>\n</svg>\n`;
        return {
          ok: true,
          message: `Rendered at ${str(s, "resolution")}. Exported scene.svg.`,
          artifact: { filename: `render-${slug(str(s, "resolution"))}-${shortId(s)}.svg`, content: svg },
        };
      },
    },
  },

  // 14 ────────────────────────────────────────────────────────────────────
  stepwise: {
    id: "stepwise",
    samples: [
      { label: "Solo quickstart", values: { size: "solo", sso: false, regions: 1, compliance: false } },
      { label: "Enterprise + compliance", values: { size: "enterprise", sso: true, regions: 3, compliance: true } },
    ],
    name: "Stepwise",
    tagline: "Adaptive onboarding — answers add/remove future steps, then provision.",
    fields: [
      { key: "size", label: "Company size", kind: "select", default: "smb", options: ["solo", "smb", "midmarket", "enterprise"] },
      { key: "sso", label: "Need SSO", kind: "toggle", default: false },
      { key: "regions", label: "Data regions", kind: "stepper", default: 1, min: 1, max: 6 },
      { key: "compliance", label: "Compliance review", kind: "toggle", default: false },
    ],
    compute: (s) => {
      let steps = 3;
      if (bool(s, "sso")) steps += 2;
      if (str(s, "size") === "enterprise") steps += 2;
      steps += Math.max(0, n(s, "regions", 1) - 1);
      if (bool(s, "compliance")) steps += 3;
      const minutes = steps * 4;
      return {
        metrics: [
          m("steps", "Steps required", `${steps}`, steps > 8 ? "warn" : "good", Math.min(100, steps * 8)),
          m("time", "Est. setup", `${minutes} min`),
          m("plan", "Tier", str(s, "size")),
        ],
        note: `${steps} onboarding steps for a ${str(s, "size")} account.`,
        trigger: bool(s, "compliance") ? "Compliance review adds a manual approval gate." : null,
      };
    },
    action: {
      label: "Provision accounts",
      confirmTitle: "Provision workspace",
      confirmBody: (s) => `Provision a ${str(s, "size")} workspace across ${n(s, "regions")} region(s)?`,
      run: (s, mt) => {
        const manifest = {
          tier: str(s, "size"),
          sso: bool(s, "sso"),
          regions: n(s, "regions"),
          complianceReview: bool(s, "compliance"),
          provisioned: mt.map((x) => ({ item: x.label, value: x.value })),
          status: "PROVISIONED",
        };
        return {
          ok: true,
          message: `Provisioned ${str(s, "size")} workspace, ${n(s, "regions")} region(s). Invites sent.`,
          artifact: { filename: `provision-${slug(str(s, "size"))}-${shortId(s)}.json`, content: JSON.stringify(manifest, null, 2) + "\n" },
        };
      },
    },
  },

  // 15 ────────────────────────────────────────────────────────────────────
  labelloop: {
    id: "labelloop",
    samples: [
      { label: "Mostly correct", values: { p1: true, p2: true, p3: true, p4: true, p5: false } },
      { label: "Low accuracy (retrain)", values: { p1: true, p2: false, p3: false, p4: false, p5: false } },
    ],
    name: "Labelloop",
    tagline: "Data labeling — correct predictions; accuracy updates, then commit to train set.",
    fields: [
      { key: "p1", label: "Sample 1 · 'cat' → correct?", kind: "toggle", default: true },
      { key: "p2", label: "Sample 2 · 'dog' → correct?", kind: "toggle", default: false },
      { key: "p3", label: "Sample 3 · 'bird' → correct?", kind: "toggle", default: true },
      { key: "p4", label: "Sample 4 · 'fish' → correct?", kind: "toggle", default: true },
      { key: "p5", label: "Sample 5 · 'frog' → correct?", kind: "toggle", default: false },
    ],
    compute: (s) => {
      const keys = ["p1", "p2", "p3", "p4", "p5"];
      const correct = keys.filter((k) => bool(s, k)).length;
      const acc = correct / keys.length;
      return {
        metrics: [
          m("acc", "Model accuracy", pct(acc), acc > 0.8 ? "good" : acc > 0.6 ? "warn" : "bad", acc * 100),
          m("correct", "Confirmed correct", `${correct} / ${keys.length}`),
          m("relabel", "To relabel", `${keys.length - correct}`, keys.length - correct > 0 ? "warn" : "good"),
        ],
        note: `${keys.length - correct} samples flagged for relabeling.`,
        trigger: acc < 0.6 ? "Accuracy below 60% — retrain recommended after commit." : null,
      };
    },
    action: {
      label: "Commit to training set",
      confirmTitle: "Write labels",
      confirmBody: (_s, mt) => `Commit confirmed labels (${mt.find((x) => x.key === "correct")?.value}) to the training set?`,
      run: (s, mt) => {
        const samples = ["cat", "dog", "bird", "fish", "frog"];
        const rows = ["sample,label,confirmed"];
        ["p1", "p2", "p3", "p4", "p5"].forEach((k, i) => {
          rows.push(`${samples[i]},${samples[i]},${bool(s, k) ? "yes" : "no"}`);
        });
        return {
          ok: true,
          message: `Wrote labels to training set. Accuracy now ${mt.find((x) => x.key === "acc")?.value}.`,
          artifact: { filename: `labels-${shortId(s)}.csv`, content: rows.join("\n") + "\n" },
        };
      },
    },
  },

  // 16 ────────────────────────────────────────────────────────────────────
  echoscript: {
    id: "echoscript",
    samples: [
      { label: "Reservation w/ time", values: { transcript: "book a table for two at noon", intent: "reservation", party: 2 } },
      { label: "Missing time", values: { transcript: "remind me to call mom", intent: "reminder", party: 1 } },
    ],
    name: "Echoscript",
    tagline: "Voice transcript — fix a word; downstream intent + entities rewrite, then act.",
    fields: [
      { key: "transcript", label: "Transcript", kind: "text", default: "book a table for two at noon", placeholder: "live transcript" },
      { key: "intent", label: "Detected intent", kind: "select", default: "reservation", options: ["reservation", "reminder", "order", "message", "unknown"] },
      { key: "party", label: "Party size", kind: "stepper", default: 2, min: 1, max: 12 },
    ],
    compute: (s) => {
      const text = str(s, "transcript");
      const words = text.trim().split(/\s+/).filter(Boolean).length;
      const hasTime = /\b(noon|\d{1,2}\s?(am|pm)|midnight|\d{1,2}:\d{2})\b/i.test(text);
      const conf = Math.min(100, 50 + words * 4 + (hasTime ? 15 : 0));
      return {
        metrics: [
          m("intent", "Intent", str(s, "intent"), "good"),
          m("entities", "Entities", `party=${n(s, "party")}${hasTime ? ", time✓" : ", time?"}`, hasTime ? "good" : "warn"),
          m("conf", "Confidence", `${conf}%`, conf > 75 ? "good" : "warn", conf),
        ],
        note: hasTime ? "Time entity found — ready to act." : "No clear time — edit the transcript.",
        trigger: !hasTime ? "Missing a time entity — correct the transcript before acting." : null,
      };
    },
    action: {
      label: "Trigger action",
      confirmTitle: "Act on intent",
      confirmBody: (s) => `Execute "${str(s, "intent")}" for party of ${n(s, "party")}?`,
      run: (s) => {
        const parsed = {
          transcript: str(s, "transcript"),
          intent: str(s, "intent"),
          entities: { partySize: n(s, "party") },
          status: "EXECUTED",
        };
        return {
          ok: true,
          message: `${str(s, "intent")} executed for ${n(s, "party")}. Confirmation queued.`,
          artifact: { filename: `intent-${slug(str(s, "intent"))}-${shortId(s)}.json`, content: JSON.stringify(parsed, null, 2) + "\n" },
        };
      },
    },
  },

  // 17 ────────────────────────────────────────────────────────────────────
  pulsedash: {
    id: "pulsedash",
    samples: [
      { label: "Tight SLO (will breach)", values: { latencyThreshold: 300, errorThreshold: 1, window: "5m" } },
      { label: "Relaxed thresholds", values: { latencyThreshold: 800, errorThreshold: 5, window: "15m" } },
    ],
    name: "Pulsedash",
    tagline: "Observability — drag thresholds against a live metric stream, then page oncall.",
    fields: [
      { key: "latencyThreshold", label: "p99 latency alert", kind: "slider", default: 400, min: 100, max: 1000, step: 10, unit: "ms" },
      { key: "errorThreshold", label: "Error-rate alert", kind: "slider", default: 2, min: 0.5, max: 10, step: 0.5, unit: "%" },
      { key: "window", label: "Window", kind: "select", default: "5m", options: ["1m", "5m", "15m", "1h"] },
    ],
    live: {
      stateKey: "_p99",
      initial: 320,
      intervalMs: 1500,
      next: (prev) => Math.max(120, Math.min(950, Math.round(prev + (Math.random() - 0.48) * 120))),
    },
    compute: (s) => {
      const p99 = n(s, "_p99", 320);
      const errRate = Math.max(0, (p99 - 300) / 100) * 0.8;
      const latThresh = n(s, "latencyThreshold", 400);
      const errThresh = n(s, "errorThreshold", 2);
      const latBreach = p99 > latThresh;
      const errBreach = errRate > errThresh;
      const breach = latBreach || errBreach;
      return {
        metrics: [
          m("p99", "Live p99", `${p99} ms`, latBreach ? "bad" : "good", Math.min(100, (p99 / 1000) * 100)),
          m("err", "Error rate", `${errRate.toFixed(1)}%`, errBreach ? "bad" : "good"),
          m("status", "Status", breach ? "BREACH" : "healthy", breach ? "bad" : "good"),
        ],
        note: `Watching p99 vs ${latThresh}ms and errors vs ${errThresh}% over ${str(s, "window")}.`,
        trigger: breach ? `Threshold breached (p99 ${p99}ms) — page oncall?` : null,
      };
    },
    action: {
      label: "Page oncall",
      confirmTitle: "Trigger page",
      confirmBody: (s) => `Page the oncall engineer for the ${str(s, "window")} window breach?`,
      run: (s, mt) => {
        const incident = [
          `# INCIDENT — Pulsedash`,
          ``,
          `Window: ${str(s, "window")}`,
          `Opened: 2026-06-01 (oncall paged via PagerDuty)`,
          ``,
          `## Snapshot at trigger`,
          metricLines(mt),
          ``,
          `## Thresholds`,
          `p99 latency alert: ${n(s, "latencyThreshold")} ms`,
          `error-rate alert: ${n(s, "errorThreshold")} %`,
        ].join("\n") + "\n";
        return {
          ok: true,
          message: `Paged oncall (PagerDuty). Incident opened for ${str(s, "window")} window.`,
          artifact: { filename: `incident-${shortId(s)}.md`, content: incident },
        };
      },
    },
  },

  // 18 ────────────────────────────────────────────────────────────────────
  inboxpilot: {
    id: "inboxpilot",
    samples: [
      { label: "Bulk friendly", values: { selected: 20, tone: "friendly", archive: true, confidence: 70 } },
      { label: "Careful formal", values: { selected: 8, tone: "formal", archive: false, confidence: 90 } },
    ],
    name: "Inboxpilot",
    tagline: "Email triage — bulk-select + tone; the engine drafts replies, then sends.",
    fields: [
      { key: "selected", label: "Selected emails", kind: "stepper", default: 12, min: 0, max: 200 },
      { key: "tone", label: "Reply tone", kind: "select", default: "friendly", options: ["friendly", "concise", "formal", "apologetic"] },
      { key: "archive", label: "Auto-archive after send", kind: "toggle", default: true },
      { key: "confidence", label: "Min confidence", kind: "slider", default: 70, min: 40, max: 95, step: 5, unit: "%" },
    ],
    compute: (s) => {
      const selected = n(s, "selected", 12);
      const conf = n(s, "confidence", 70);
      const autoDraft = Math.round(selected * (conf / 100));
      const review = selected - autoDraft;
      return {
        metrics: [
          m("drafts", "Auto-drafted", `${autoDraft}`, "good"),
          m("review", "Need review", `${review}`, review > 0 ? "warn" : "good"),
          m("tone", "Tone", str(s, "tone")),
        ],
        note: `${autoDraft} of ${selected} drafted above ${conf}% confidence.`,
        trigger: selected === 0 ? "Select emails to draft replies." : null,
      };
    },
    action: {
      label: "Send all",
      confirmTitle: "Send drafted replies",
      confirmBody: (_s, mt) => `Send the ${mt.find((x) => x.key === "drafts")?.value} auto-drafted replies?`,
      run: (s, mt) => {
        if (n(s, "selected") <= 0) return { ok: false, message: "No emails selected." };
        const drafts = Number(mt.find((x) => x.key === "drafts")?.value ?? 0);
        const tone = str(s, "tone");
        const mbox = Array.from({ length: drafts }, (_, i) =>
          [
            `From: you@example.com`,
            `To: contact${i + 1}@example.com`,
            `Subject: Re: your message`,
            ``,
            `Hi — thanks for reaching out. (${tone} auto-draft #${i + 1}.)`,
            ``,
            "----",
          ].join("\n"),
        ).join("\n");
        return {
          ok: true,
          message: `Sent ${drafts} replies${bool(s, "archive") ? " and archived threads" : ""}.`,
          artifact: { filename: `replies-${slug(tone)}-${shortId(s)}.mbox`, content: mbox + "\n" },
        };
      },
    },
  },

  // 19 ────────────────────────────────────────────────────────────────────
  castlist: {
    id: "castlist",
    samples: [
      { label: "Healthy funnel", values: { applied: 60, screened: 20, onsite: 6, minScore: 60 } },
      { label: "Bar too high (empty)", values: { applied: 40, screened: 10, onsite: 2, minScore: 95 } },
    ],
    name: "Castlist",
    tagline: "Hiring shortlist — advance candidates; ranking refits, then send links.",
    fields: [
      { key: "applied", label: "Applied", kind: "stepper", default: 48, min: 0, max: 500 },
      { key: "screened", label: "Screened", kind: "stepper", default: 16, min: 0, max: 200 },
      { key: "onsite", label: "Onsite", kind: "stepper", default: 5, min: 0, max: 40 },
      { key: "minScore", label: "Min score", kind: "slider", default: 70, min: 0, max: 100, step: 5 },
    ],
    compute: (s) => {
      const onsite = n(s, "onsite", 5), screened = n(s, "screened", 16), minScore = n(s, "minScore", 70);
      const shortlist = Math.max(0, Math.round(onsite * (1 - minScore / 200)));
      const passRate = screened > 0 ? onsite / screened : 0;
      return {
        metrics: [
          m("shortlist", "Shortlist", `${shortlist}`, shortlist > 0 ? "good" : "warn"),
          m("pass", "Screen→onsite", pct(passRate), "default", passRate * 100),
          m("bar", "Bar", `≥ ${minScore}`),
        ],
        note: `${shortlist} candidates clear the bar for scheduling.`,
        trigger: shortlist === 0 ? "No one clears the bar — lower the min score." : null,
      };
    },
    action: {
      label: "Send scheduling links",
      confirmTitle: "Advance candidates",
      confirmBody: (_s, mt) => `Send scheduling links to the ${mt.find((x) => x.key === "shortlist")?.value} shortlisted candidates?`,
      run: (s, mt) => {
        const sl = Number(mt.find((x) => x.key === "shortlist")?.value ?? 0);
        if (sl <= 0) return { ok: false, message: "Empty shortlist." };
        const rows = ["candidate,stage,scheduling_link"];
        for (let i = 1; i <= sl; i++) {
          rows.push(`Candidate ${i},onsite,https://schedule.example.com/c/${shortId(s)}-${i}`);
        }
        return {
          ok: true,
          message: `Sent ${sl} scheduling links. Calendars opened.`,
          artifact: { filename: `shortlist-${shortId(s)}.csv`, content: rows.join("\n") + "\n" },
        };
      },
    },
  },

  // 20 ────────────────────────────────────────────────────────────────────
  brewbench: {
    id: "brewbench",
    samples: [
      { label: "Opus baseline", values: { temperature: 0.3, maxTokens: 512, dataset: 200, model: "opus" } },
      { label: "Cheap & risky", values: { temperature: 1.5, maxTokens: 256, dataset: 500, model: "haiku" } },
    ],
    name: "Brewbench",
    tagline: "Eval playground — tune params; eval rows rerun live, then promote the winner.",
    fields: [
      { key: "temperature", label: "Temperature", kind: "slider", default: 0.7, min: 0, max: 2, step: 0.1 },
      { key: "maxTokens", label: "Max tokens", kind: "slider", default: 512, min: 64, max: 4096, step: 64 },
      { key: "dataset", label: "Dataset rows", kind: "slider", default: 200, min: 20, max: 2000, step: 20 },
      { key: "model", label: "Model", kind: "select", default: "sonnet", options: ["haiku", "sonnet", "opus"] },
    ],
    compute: (s) => {
      const temp = n(s, "temperature", 0.7), rows = n(s, "dataset", 200), tokens = n(s, "maxTokens", 512);
      const modelBoost = { haiku: 0.78, sonnet: 0.88, opus: 0.93 }[str(s, "model", "sonnet")] ?? 0.85;
      const acc = Math.max(0, Math.min(1, modelBoost - Math.abs(temp - 0.5) * 0.12));
      const costPer = ({ haiku: 1, sonnet: 3, opus: 15 }[str(s, "model", "sonnet")] ?? 3) * (tokens / 1000) / 1000;
      const cost = costPer * rows;
      return {
        metrics: [
          m("acc", "Accuracy", pct(acc), acc > 0.85 ? "good" : "warn", acc * 100),
          m("cost", "Run cost", money(cost)),
          m("rows", "Rows", `${rows}`),
          m("model", "Model", str(s, "model")),
        ],
        note: `${str(s, "model")} @ temp ${temp.toFixed(1)} → ${pct(acc)} on ${rows} rows.`,
        trigger: acc < 0.8 ? "Accuracy under 80% — tune temperature or switch model before promoting." : null,
      };
    },
    action: {
      label: "Promote to prod",
      confirmTitle: "Promote winning config",
      confirmBody: (s, mt) => `Promote ${str(s, "model")} (${mt.find((x) => x.key === "acc")?.value}) to production?`,
      run: (s, mt) => {
        const acc = mt.find((x) => x.key === "acc")?.value ?? "0%";
        const evalRun = {
          model: str(s, "model"),
          temperature: n(s, "temperature"),
          maxTokens: n(s, "maxTokens"),
          datasetRows: n(s, "dataset"),
          results: mt.map((x) => ({ metric: x.label, value: x.value })),
          promotedToProd: true,
        };
        return {
          ok: true,
          message: `Promoted ${str(s, "model")} to prod. Eval ${acc} saved to history.`,
          artifact: { filename: `eval-${slug(str(s, "model"))}-${shortId(s)}.json`, content: JSON.stringify(evalRun, null, 2) + "\n" },
        };
      },
    },
  },
};

export function getAppDef(id: string): AppDef | undefined {
  return APP_DEFS[id];
}

/** Strip functions so the def can cross the server→client boundary. */
export function toAppView(def: AppDef): AppDefView {
  const meta = getAppMeta(def.id);
  return {
    id: def.id,
    name: def.name,
    tagline: def.tagline,
    fields: def.fields,
    actionLabel: def.action.label,
    hasLive: Boolean(def.live),
    accent: meta.accent,
    icon: meta.icon,
    category: meta.category,
    samples: def.samples ?? [],
  };
}

export function defaultState(def: AppDef): AppState {
  const s: AppState = {};
  for (const f of def.fields) s[f.key] = f.default;
  if (def.live) s[def.live.stateKey] = def.live.initial;
  return s;
}
