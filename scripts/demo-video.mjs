// Records a captioned walkthrough of the bidirectional-UI prototype.
//   node scripts/demo-video.mjs    (dev server must be running on :3000)
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.DEMO_BASE || "http://localhost:3000";
const OUT_DIR = path.resolve("demo-video");
const W = 1280;
const H = 800;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureOverlay(page) {
  await page.evaluate(() => {
    if (document.getElementById("__demo_cap")) return;
    const style = document.createElement("style");
    style.textContent = `
      #__demo_cap{position:fixed;left:0;right:0;bottom:0;z-index:2147483647;pointer-events:none;
        font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
        background:linear-gradient(to top,rgba(10,10,12,.92),rgba(10,10,12,.78) 70%,transparent);
        color:#fff;padding:22px 36px 26px;transition:opacity .35s ease;opacity:0;}
      #__demo_cap .step{display:inline-block;font:700 11px/1 ui-monospace,monospace;
        letter-spacing:.25em;text-transform:uppercase;color:#EC3B4A;
        border:1px solid rgba(236,59,74,.5);border-radius:999px;padding:5px 10px;margin-bottom:10px;}
      #__demo_cap .title{font-size:26px;font-weight:700;letter-spacing:-.01em;line-height:1.2;}
      #__demo_cap .sub{font-size:15px;color:#d8d2c8;margin-top:6px;max-width:1050px;line-height:1.4;}
      #__demo_cursor{position:fixed;z-index:2147483646;width:22px;height:22px;margin:-11px 0 0 -11px;
        border-radius:999px;background:rgba(236,59,74,.35);border:2px solid #EC3B4A;
        transition:left .5s ease,top .5s ease,transform .15s ease;pointer-events:none;left:-50px;top:-50px;}
    `;
    document.head.appendChild(style);
    const cap = document.createElement("div");
    cap.id = "__demo_cap";
    cap.innerHTML = `<div class="step"></div><div class="title"></div><div class="sub"></div>`;
    document.body.appendChild(cap);
    const cur = document.createElement("div");
    cur.id = "__demo_cursor";
    document.body.appendChild(cur);
  });
}

async function caption(page, step, title, sub = "") {
  await ensureOverlay(page);
  await page.evaluate(
    ([step, title, sub]) => {
      const cap = document.getElementById("__demo_cap");
      cap.querySelector(".step").textContent = step;
      cap.querySelector(".title").textContent = title;
      cap.querySelector(".sub").textContent = sub;
      cap.style.opacity = "1";
    },
    [step, title, sub],
  );
}

async function moveCursorTo(page, locator) {
  try {
    const box = await locator.boundingBox();
    if (!box) return;
    await page.evaluate(
      ([x, y]) => {
        const c = document.getElementById("__demo_cursor");
        if (c) {
          c.style.left = x + "px";
          c.style.top = y + "px";
        }
      },
      [box.x + box.width / 2, box.y + box.height / 2],
    );
    await sleep(650);
  } catch {
    /* ignore */
  }
}

async function click(page, locator) {
  await locator.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
  await moveCursorTo(page, locator);
  await page.evaluate(() => {
    const c = document.getElementById("__demo_cursor");
    if (c) c.style.transform = "scale(.7)";
  });
  await locator.click({ timeout: 6000 }).catch(() => {});
  await page.evaluate(() => {
    const c = document.getElementById("__demo_cursor");
    if (c) c.style.transform = "scale(1)";
  });
  await sleep(400);
}

async function goto(page, url, step, title, sub) {
  // NOTE: these pages hold a long-lived SSE stream, so "networkidle" never
  // settles — use domcontentloaded so navigation resolves immediately.
  await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await sleep(1200);
  await caption(page, step, title, sub);
  await sleep(2200);
}

async function main() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir: OUT_DIR, size: { width: W, height: H } },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);

  // 0. Title card
  await page.goto(`${BASE}/apps`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await sleep(1200);
  await caption(
    page,
    "What this is",
    "Bidirectional UI — apps that live inside an AI loop",
    "Normally a chatbot waits for you to hit Send. Here the UI IS the loop: your input streams in, the engine streams results back, and any real-world action pauses for your approval. Watch all three.",
  );
  await sleep(5200);

  // 1. Directory
  await caption(
    page,
    "01 · The directory",
    "20 live apps on one shared engine",
    "Like Claude's connectors, but each tile is a live bidirectional app. Colour key: red = your input in, green = engine pushes back, amber = real-world action.",
  );
  await page.mouse.wheel(0, 320);
  await sleep(4800);

  // 2. Tillpoint
  await goto(
    page,
    "/apps/tillpoint",
    "02 · A live checkout",
    "Tillpoint — change the cart, totals recompute instantly",
    "This is a real bidirectional app. There is no Send button — every edit you make streams straight into the engine.",
  );
  const scenario = page.getByRole("button", { name: /Loaded cart/ });
  await caption(
    page,
    "02 · UI → engine",
    "Step 1 — load a scenario (your input flows in)",
    "Clicking adds items, applies coupon SAVE20, and sets a California ZIP — all sent to the engine at once.",
  );
  await click(page, scenario);
  await sleep(3200);
  await caption(
    page,
    "02 · engine → UI",
    "Step 2 — the engine pushes the new totals back",
    "Subtotal, discount, California tax and shipping recomputed live and rendered into the same panel — no page reload.",
  );
  await sleep(3400);
  await caption(
    page,
    "02 · engine → real world",
    "Step 3 — checkout pauses for your approval",
    "Before charging a card, the loop stops and asks. The human is always in control of real-world actions.",
  );
  await click(page, page.getByRole("button", { name: /Place order/ }));
  await sleep(2400);
  await caption(
    page,
    "02 · approval",
    "Approve the (mock) Stripe charge",
    "On approval the side effect runs and the result streams back — the banner flips to Paid.",
  );
  await click(page, page.getByRole("button", { name: /Pay now/ }));
  await sleep(3200);

  // 3. Pulsedash
  await goto(
    page,
    "/apps/pulsedash",
    "03 · A live data stream",
    "Pulsedash — the engine pushes updates on its own",
    "Watch the 'Live p99' latency number. Nobody is touching the screen — the engine streams new values every 1.5 seconds.",
  );
  await sleep(5500); // let the live number visibly move
  await caption(
    page,
    "03 · UI → engine",
    "Tighten the alert threshold",
    "We set a strict SLO that the live metric will soon breach — your input reshapes what the engine watches for.",
  );
  await click(page, page.getByRole("button", { name: /Tight SLO/ }));
  await sleep(3800);
  await caption(
    page,
    "03 · trigger → action",
    "Threshold breached → page oncall",
    "When the live value crosses the line, the engine flags a BREACH and offers a real-world action — gated by approval.",
  );
  await click(page, page.getByRole("button", { name: /^Page oncall$/ }).first());
  await sleep(1800);
  const pulseDialog = page.locator("div.fixed.inset-0");
  await caption(
    page,
    "03 · approval",
    "Approve the page",
    "Same pattern as checkout: the real action (paging PagerDuty) only runs once you say yes.",
  );
  await click(page, pulseDialog.getByRole("button", { name: /Page oncall/ }));
  await sleep(3200);

  // 4. McpDeck — engine GENERATES an app
  await goto(
    page,
    "/apps/mcpdeck/generate",
    "04 · The finale",
    "The engine GENERATES the app from a prompt",
    "So far the apps were pre-built. Now we don't pick an app — we describe one, and the AI authors it and wires it to real MCP tools.",
  );
  await sleep(1500);
  const prompt = page.getByRole("button", { name: /Show git working-tree status/ });
  await caption(
    page,
    "04 · UI → engine",
    "Describe the app you want in plain English",
    "We ask for a git dashboard with a button to create a release branch. One sentence — no code.",
  );
  await click(page, prompt);
  await caption(
    page,
    "04 · generating",
    "The LLM is authoring the app live…",
    "It picks which MCP tools to read, how to lay out the data, and what action buttons to add — then returns a runnable spec.",
  );
  // Wait for the generated app to appear.
  await page.getByText("Engine-generated app").waitFor({ timeout: 90000 }).catch(() => {});
  await sleep(1500);
  await caption(
    page,
    "04 · engine → UI",
    "The generated app runs, bound to live MCP data",
    "Its data panels were just fetched from the real MCP server. Click 'view spec' anytime to see exactly what the engine authored.",
  );
  await sleep(3800);

  // Try to run a generated action (approval-gated).
  const actionsHeading = page.getByText(/ask before running/);
  if (await actionsHeading.count()) {
    await caption(
      page,
      "04 · engine → real world",
      "Even generated buttons ask first",
      "The engine added a 'create branch' action. Like everything else, it pauses for approval before touching the repo.",
    );
    const actionBtn = actionsHeading.locator("xpath=ancestor::div[1]").getByRole("button").first();
    await click(page, actionBtn);
    await sleep(1800);
    // Approve button in the craft modal carries class flex-1 (X-close + Cancel do not).
    const approveBtn = page.locator("div.fixed.inset-0 button.flex-1");
    await click(page, approveBtn);
    await sleep(3400);
  }

  await caption(
    page,
    "Recap",
    "One engine loop, three flows, every real action approved",
    "20 live apps PLUS an app generator — your input streams in, the engine streams results back, and nothing touches the real world without your yes.",
  );
  await sleep(5000);

  const video = page.video();
  await context.close();
  await browser.close();

  if (video) {
    const src = await video.path();
    const dest = path.join(OUT_DIR, "bidirectional-ui-demo.webm");
    fs.copyFileSync(src, dest);
    console.log("VIDEO:", dest);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
