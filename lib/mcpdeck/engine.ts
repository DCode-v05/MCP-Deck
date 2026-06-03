import { getProvider, type ProviderId } from "@/lib/engine/providers";
import type { AgentMessage, ToolCall, ToolDefinition } from "@/lib/engine/tools";
import { makeId, type McpDeckSession } from "./session";
import { authorCraft } from "@/lib/crafts/authoring";

// Terse goals require the agent to discover + traverse across apps before acting,
// so it gets a wider step budget (set via the autonomous-operator-prompt workflow).
const MAX_ITERATIONS = 20;
// Per-tool wall-clock cap so one slow/hung MCP call can't stall the whole loop.
const TOOL_TIMEOUT_MS = 45_000;

/**
 * The agent's operating procedure — the "intelligence" that lets a TERSE goal
 * (e.g. "complete Project X", "solve the issue assigned to me") trigger full
 * autonomous cross-app reasoning: decompose → survey/discover → follow
 * cross-references → infer the deliverable → act (writes gated) → verify →
 * finish. Designed + adversarially judged via the autonomous-operator-prompt
 * workflow. Embedded ABOVE the dynamic state sections (enabled servers / recent
 * results) that it references.
 */
const OPERATING_PROCEDURE = `## How you work

You hold tools from MULTIPLE apps at once and act as ONE integrated system: the output of one app feeds the next. Treat all connected apps as a single shared knowledge graph — every entity (page, brief, project, issue, repo, file, PR, channel, message, person) is a NODE, and any mention of another app's entity inside one (a repo, project, assignee, file path, ticket number, link, @mention) is a POINTER you follow into the owning app, not a dead string. The user's goal may be TERSE and high-level; figuring out the whole cross-app workflow is YOUR job, not theirs to enumerate.

Run every goal as one forward cycle: **ORIENT → SURVEY → PLAN → ACT → VERIFY → FINISH**. Move forward; only loop back when new facts demand it. Work STEP BY STEP — exactly ONE tool call per turn: read its result, then decide the next call. Before EACH call, write 1–3 sentences of reasoning naming the concrete ids/values you are using and why (shown to the user as your thinking); make it specific, never generic.

**ORIENT (decompose the goal into a falsifiable hypothesis).** Restate the terse goal in your own words as a working hypothesis: what the user most likely means, what "done" concretely looks like (the deliverable AND the consistent end state across every involved app), and which app(s) likely hold the starting node. Treat this as a provisional claim to CONFIRM OR CORRECT with reads — never as fact to act on blindly. Do not assume any specific entity, file, naming scheme, or step exists; discover it.

**SURVEY (discover before acting; seek disconfirming evidence).** When the target is described rather than given as an id, use READ tools (search / list / get) to find candidate entities. Score candidates against the hypothesis using title, status, assignee, recency, and references — and actively look for evidence that would REFUTE your current guess, not just confirm it, so a confident-but-wrong hypothesis cannot drive a write.
  - FOLLOW POINTERS: read each relevant node fully, extract its outbound references, and follow only the references the goal actually needs — most-direct-path first — into the owning app. A brief naming a project means open that project; an issue naming a repo means open that repo; a file path means inspect that file; a person's name means resolve that person. Keep traversing until you have the full context to act: descriptions, acceptance criteria, linked specs, and the current state and REAL ids of every node the deliverable will touch.
  - RESOLVE names → REAL ids as you go; never carry a name where a tool wants an id.
  - Reads run AUTOMATICALLY and never pause — gather freely and purposefully (each read should answer a question the next step needs). STOP surveying once you can name the deliverable and every target id, and once further reads stop changing the plan — not before, and not after.
  - DISAMBIGUATE: if one strong match exists, proceed. If several match the goal equally AND no further read can separate them, surface the candidates and ask the user exactly ONE crisp question. Otherwise keep going.

**PLAN (commit to a concrete deliverable).** INFER the deliverable from the gathered evidence — acceptance criteria, the issue/brief body, linked specs, observed conventions — NOT from the user's literal words. Make the smallest, most additive change that satisfies "done." State a short ordered list of the writes needed and the order that leaves the whole graph consistent (e.g. produce the artifact AND update every tracker / linked node / channel that should reflect it).

**ACT (writes are deliberate, gated, and additive).** WRITE tools (create / update / comment / commit / pull request / send / delete) each PAUSE for ONE human approval — so write only what the plan requires, one at a time, in a safe order, smallest scope first.
  - PRE-WRITE CHECK (one line in your reasoning): confirm the exact target — which entity, which fields, which app(s) must end up consistent — and that you have READ it. Never write to an entity you have not first read.
  - PRECONDITIONS via reads: Does the target already exist (avoid DUPLICATES)? Is this the RIGHT entity? Would this OVERWRITE or destroy existing content? Be purely ADDITIVE unless the goal explicitly demands replacement; never pass a sha or force/overwrite flag by default; never clobber content you have not read. **If a write would clobber unknown content, STOP and ask.**
  - NEVER FABRICATE ids, names, counts, shas, urls, or values — every argument must come from a real read result you pass forward.

**VERIFY (confirm each write landed).** After each write, re-read the affected node to confirm it took effect. A goal is NOT done until every node the deliverable touches reflects the new state (e.g. the issue is closed AND the tracker is updated AND any referencing channel is notified). If verification fails, diagnose from the result and correct — never assume success.

**FINISH (stop cleanly).** When the end state is achieved and verified across all touched nodes, call \`finish\` with a concise summary naming the concrete outcome — real ids, links, and exactly what changed in each app. When an interactive, editable result serves the user better than prose (an actionable list, a record to edit), call \`render_ui\` first with a short description — it renders a LIVE panel bound to the real tools — then finish.

**EFFICIENCY & RECOVERY.** You have a finite budget (~20 turns); don't spiral into exploration once you have enough to act. Each call must advance the cycle (confirm, refute, resolve an id, or execute a planned write). Never repeat an identical call: do not re-run a read whose answer you already hold — consult the recent results listed below instead of re-fetching. If a tool errors, read the message, then change the args or pick a DIFFERENT tool — never retry the same failing call.`;

export interface McpDeckRunOpts {
  providerId: ProviderId;
  goal: string;
}

type ReadContext = ReturnType<McpDeckSession["readContext"]>;

function buildSystemPrompt(session: McpDeckSession, opts: McpDeckRunOpts, ctx: ReadContext): string {
  const lines: string[] = [
    `You are McpDeck — an autonomous agent that ORCHESTRATES across the user's connected apps to complete a goal end to end.`,
    ``,
    `GOAL: ${opts.goal}`,
    ``,
    OPERATING_PROCEDURE,
    ``,
    `# Connected apps (enabled now)`,
  ];
  for (const s of ctx.enabledServers) {
    const info = session.findServerInfo(s);
    if (info) lines.push(`  - ${info.id}: ${info.description}`);
  }
  if (ctx.enabledServers.length === 0) {
    lines.push(`  (none — the user disabled every server; call finish explaining you have no tools to use)`);
  }

  if (ctx.pinnedTools.length > 0) {
    lines.push(``, `Pinned tools (the user wants these preferred):`);
    for (const t of ctx.pinnedTools) lines.push(`  - ${t}`);
  }

  if (ctx.openResources.length > 0) {
    lines.push(``, `Resources the user has opened (a hint about their interest):`);
    for (const r of ctx.openResources.slice(0, 8)) lines.push(`  - ${r}`);
    if (ctx.openResources.length > 8) lines.push(`  - … ${ctx.openResources.length - 8} more`);
  }

  if (ctx.recentCalls.length > 0) {
    lines.push(``, `Recent tool results (most recent last) — do not repeat unless arguments differ:`);
    for (const c of ctx.recentCalls) {
      const status = c.isError ? "ERROR" : "ok";
      lines.push(`  - ${c.toolId} [${status}] ${c.resultPreview ?? ""}`.trimEnd());
    }
  }

  return lines.join("\n");
}

/** Plain-language one-liner describing what the engine is about to do this iteration. */
function describeIntent(iteration: number, ctx: ReadContext, totalIterations: number): string {
  if (iteration === 1) {
    const enabled = ctx.enabledServers.join(", ") || "no servers";
    return `Reading connected apps: ${enabled}${
      ctx.pinnedTools.length > 0 ? ` · ${ctx.pinnedTools.length} pinned tool(s)` : ""
    }. Planning the first step.`;
  }
  const lastCall = ctx.recentCalls[ctx.recentCalls.length - 1];
  if (lastCall) {
    return `Conditioning on ${lastCall.toolId} result. Deciding the next step (step ${iteration}/${totalIterations}).`;
  }
  return `Re-reading session state (step ${iteration}/${totalIterations}).`;
}

function toolDefsForSession(session: McpDeckSession): ToolDefinition[] {
  const enabled = new Set(session.enabledServerIds());
  const defs: ToolDefinition[] = session.toolInfos().filter((t) => enabled.has(t.serverId)).map((t) => ({
    name: t.id.replace(".", "__"),
    description: `[${t.serverId}] ${t.description}${t.hasSideEffect ? " (WRITE — pauses for user approval)" : ""}`,
    input_schema: {
      type: "object",
      properties: Object.fromEntries(
        Object.entries(t.inputSchema.properties).map(([k, v]) => [
          k,
          {
            type: v.type as "string" | "number" | "boolean" | "object" | "array",
            description: v.description,
            enum: v.enum,
          },
        ]),
      ),
      required: t.inputSchema.required,
    },
  }));
  defs.push({
    name: "render_ui",
    description:
      "Render a LIVE, interactive UI panel for the user (bound to the real tools — auto-refreshing and auto-saving). Use when an editable list/record helps. Provide a short natural-language description of what to show.",
    input_schema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "What the panel should show, e.g. 'an editable list of the open issues in project X'.",
        },
      },
      required: ["description"],
    },
  });
  defs.push({
    name: "finish",
    description: "Mark the goal complete and emit a one-paragraph summary of what you did and the outcome.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Plain-language outcome (ids, links, what changed)." },
      },
      required: ["summary"],
    },
    terminal: true,
  });
  return defs;
}

function denameTool(toolName: string): string {
  return toolName.replace("__", ".");
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`tool timed out after ${ms}ms`)), ms).unref?.()),
  ]);
}

/**
 * Robust tool execution: a per-call timeout, plus ONE retry for READ tools on a
 * transient failure (writes are NEVER retried — a re-sent write could duplicate
 * a real side effect).
 */
async function callToolRobust(
  session: McpDeckSession,
  tool: { id: string; hasSideEffect: boolean },
  args: Record<string, unknown>,
): Promise<{ result: string; isError: boolean }> {
  const attempts = tool.hasSideEffect ? 1 : 2;
  let last: { result: string; isError: boolean } = { result: "tool failed", isError: true };
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await withTimeout(session.callTool(tool.id, args), TOOL_TIMEOUT_MS);
      if (!r.isError) return r;
      last = r;
    } catch (err) {
      last = { result: errMsg(err), isError: true };
    }
    if (i < attempts - 1) {
      session.logEvent("warn", `retrying ${tool.id} after error`);
      await delay(800);
    }
  }
  return last;
}

/**
 * render_ui: author a live craft (the same editable, auto-saving panels the
 * craft engine produces) and stream it to the client as a `craft` event. The
 * agent's accumulated messages are passed as prior context so the author can
 * reuse the REAL ids already resolved during the workflow.
 */
async function authorAndEmitCraft(
  session: McpDeckSession,
  opts: McpDeckRunOpts,
  description: string,
  priorMessages: AgentMessage[],
): Promise<string> {
  try {
    const { block } = await authorCraft(description, session.provider, {
      providerId: opts.providerId,
      threadId: makeId("thr"),
      id: makeId("craft"),
      ts: new Date().toISOString(),
      priorMessages,
    });
    if (!block) return "Could not render a UI for that.";
    session.emit({ type: "craft", block });
    return `Rendered an interactive panel: "${block.payload.title}". The user can view and edit it live.`;
  } catch (err) {
    return `render_ui failed: ${errMsg(err)}`;
  }
}

/** One model turn, with a single retry on a transient provider failure. */
async function streamTurn(
  invoker: ReturnType<typeof getProvider>,
  systemPrompt: string,
  messages: AgentMessage[],
  tools: ToolDefinition[],
  session: McpDeckSession,
): Promise<{
  assistantText: string;
  toolCalls: ToolCall[];
  usage: { inputTokens: number; outputTokens: number };
  stopReason: string;
}> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const turn = invoker(systemPrompt, messages, tools);
      let assistantText = "";
      const toolCalls: ToolCall[] = [];
      for await (const ev of turn.stream) {
        if (ev.type === "text") {
          assistantText += ev.delta;
          session.emit({ type: "engine_text", text: ev.delta });
        } else if (ev.type === "tool_call") {
          toolCalls.push(ev.call);
        }
      }
      const { usage, stopReason } = await turn.done();
      return { assistantText, toolCalls, usage, stopReason };
    } catch (err) {
      lastErr = err;
      if (attempt === 0) {
        session.logEvent("warn", `model turn failed, retrying: ${errMsg(err)}`);
        await delay(1500);
        continue;
      }
    }
  }
  throw lastErr;
}

export async function runMcpDeck(session: McpDeckSession, opts: McpDeckRunOpts): Promise<void> {
  session.goal = opts.goal;
  session.status = "running";
  session.emit({ type: "engine_iteration", iteration: 0, goal: opts.goal });
  session.logEvent("info", `goal: ${opts.goal}`);

  const invoker = getProvider(opts.providerId);
  const messages: AgentMessage[] = [{ role: "user", content: opts.goal }];

  let totalInput = 0;
  let totalOutput = 0;

  try {
    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
      if (session.shouldStop()) {
        session.status = "completed";
        session.emit({ type: "engine_done", reason: "stopped", summary: null });
        return;
      }

      session.emit({ type: "engine_iteration", iteration, goal: opts.goal });
      session.recordIteration();

      // The "in between" step: read live MCP state, broadcast it as a thought,
      // then fold it into the prompt.
      const ctx = session.readContext();
      session.emit({
        type: "engine_thought",
        thought: {
          iteration,
          enabledServers: ctx.enabledServers,
          pinnedTools: ctx.pinnedTools,
          openResources: ctx.openResources,
          recentCalls: ctx.recentCalls,
          intent: describeIntent(iteration, ctx, MAX_ITERATIONS),
        },
      });

      const systemPrompt = buildSystemPrompt(session, opts, ctx);
      const tools = toolDefsForSession(session);

      const { assistantText, toolCalls, usage } = await streamTurn(
        invoker,
        systemPrompt,
        messages,
        tools,
        session,
      );

      totalInput += usage.inputTokens;
      totalOutput += usage.outputTokens;
      session.recordEngineUsage(totalInput, totalOutput, estimateCost(opts.providerId, totalInput, totalOutput));

      if (toolCalls.length === 0) {
        // No tool call: the model answered in prose. Treat that as the finish.
        session.status = "completed";
        session.emit({ type: "engine_done", reason: "completed", summary: assistantText.trim() || "Done." });
        session.emit({
          type: "usage",
          inputTokens: totalInput,
          outputTokens: totalOutput,
          totalCost: estimateCost(opts.providerId, totalInput, totalOutput),
        });
        return;
      }

      messages.push({ role: "assistant", content: assistantText, toolCalls });

      const toolResults: Array<{ toolCallId: string; name: string; content: string; isError: boolean }> = [];
      let didFinish = false;
      let finishSummary: string | null = null;

      for (const call of toolCalls) {
        if (session.shouldStop()) break;

        if (call.name === "finish") {
          didFinish = true;
          finishSummary = String((call.input as Record<string, unknown>).summary ?? "Done.");
          toolResults.push({ toolCallId: call.id, name: call.name, content: "completed", isError: false });
          continue;
        }

        if (call.name === "render_ui") {
          const desc = String((call.input as Record<string, unknown>).description ?? opts.goal);
          const result = await authorAndEmitCraft(session, opts, desc, messages);
          toolResults.push({ toolCallId: call.id, name: call.name, content: result, isError: false });
          continue;
        }

        const toolId = denameTool(call.name);
        const tool = session.findToolInfo(toolId);
        if (!tool) {
          toolResults.push({
            toolCallId: call.id,
            name: call.name,
            content: `Unknown tool: ${toolId}`,
            isError: true,
          });
          continue;
        }

        let finalArgs = (call.input ?? {}) as Record<string, unknown>;
        let argsEdited = false;

        // -- Auto reads / approve writes --
        // WRITE tools pause for the human gate; READ tools run automatically.
        if (tool.hasSideEffect) {
          const requestId = makeId("apr");
          const verdict = await session.awaitApproval({
            requestId,
            serverId: tool.serverId,
            toolId: tool.id,
            args: finalArgs,
          });
          if (verdict.kind === "deny") {
            toolResults.push({
              toolCallId: call.id,
              name: call.name,
              content: `User denied this write.${verdict.reason ? ` Reason: ${verdict.reason}` : ""} Reconsider or take a different approach.`,
              isError: true,
            });
            session.logEvent("info", `denied ${tool.id}`);
            continue;
          }
          finalArgs = verdict.args;
          argsEdited = JSON.stringify(finalArgs) !== JSON.stringify(call.input ?? {});
        }

        const replay = session.recordToolStart({
          id: makeId("rep"),
          iteration,
          serverId: tool.serverId,
          toolId: tool.id,
          args: finalArgs,
          argsEdited,
          verdict: tool.hasSideEffect ? "approved" : "auto",
          startedAt: Date.now(),
        });

        const exec = await callToolRobust(session, tool, finalArgs);
        session.recordToolCompletion(replay.id, exec.result, exec.isError);
        toolResults.push({
          toolCallId: call.id,
          name: call.name,
          content: exec.result,
          isError: exec.isError,
        });
      }

      messages.push({ role: "tool", results: toolResults });

      if (didFinish) {
        session.status = "completed";
        session.emit({ type: "engine_done", reason: "completed", summary: finishSummary });
        session.emit({
          type: "usage",
          inputTokens: totalInput,
          outputTokens: totalOutput,
          totalCost: estimateCost(opts.providerId, totalInput, totalOutput),
        });
        return;
      }
    }

    session.status = "completed";
    session.emit({
      type: "engine_done",
      reason: "completed",
      summary: `Reached the step limit (${MAX_ITERATIONS}). Re-run with a narrower goal if it isn't finished.`,
    });
    session.emit({
      type: "usage",
      inputTokens: totalInput,
      outputTokens: totalOutput,
      totalCost: estimateCost(opts.providerId, totalInput, totalOutput),
    });
  } catch (err) {
    const msg = errMsg(err);
    session.status = "error";
    session.logEvent("error", msg);
    session.emit({ type: "engine_done", reason: "error", summary: msg });
  }
}

function estimateCost(providerId: ProviderId, inputTokens: number, outputTokens: number): number {
  // Rough per-MTok pricing for the default model — a coarse estimate that keeps
  // McpDeck self-contained.
  const rates: Record<string, { input: number; output: number }> = {
    sonnet: { input: 3, output: 15 },
    haiku: { input: 1, output: 5 },
  };
  const r = rates[providerId] ?? rates.sonnet;
  return (inputTokens / 1_000_000) * r.input + (outputTokens / 1_000_000) * r.output;
}

/**
 * Replay: re-execute a past tool call (optionally with edited args). No LLM —
 * a deterministic re-run, recorded as a fresh replay entry.
 */
export async function replayToolCall(
  session: McpDeckSession,
  replayId: string,
  editedArgs?: Record<string, unknown>,
): Promise<void> {
  const original = session.getReplayEntry(replayId);
  if (!original) {
    session.logEvent("error", `replay: entry ${replayId} not found`);
    return;
  }
  const args = editedArgs ?? original.args;
  const argsEdited = JSON.stringify(args) !== JSON.stringify(original.args);
  session.logEvent("info", `replaying ${original.toolId}${argsEdited ? " (edited args)" : ""}`);

  const entry = session.recordToolStart({
    id: makeId("rep"),
    iteration: original.iteration,
    serverId: original.serverId,
    toolId: original.toolId,
    args,
    argsEdited,
    verdict: "auto",
    startedAt: Date.now(),
  });
  const exec = await session.callTool(original.toolId, args);
  session.recordToolCompletion(entry.id, exec.result, exec.isError);
}

/**
 * Branch: start a NEW engine run on the same session, seeded with the tool
 * results up to (and including) the chosen call as prior context.
 */
export async function branchFrom(
  session: McpDeckSession,
  replayId: string,
  newGoal: string,
  providerId: ProviderId,
): Promise<void> {
  const log = session.replayLog();
  const idx = log.findIndex((r) => r.id === replayId);
  const upTo = idx >= 0 ? log.slice(0, idx + 1) : log;

  const priorContext = upTo
    .filter((r) => r.result)
    .map((r) => `- ${r.toolId}(${JSON.stringify(r.args)}) → ${r.result}`)
    .join("\n");

  const seededGoal = priorContext
    ? `${newGoal}\n\nContext from earlier in this session (already executed — do not repeat unless needed):\n${priorContext}`
    : newGoal;

  session.resetStop();
  session.logEvent("info", `branching from ${log[idx]?.toolId ?? "start"}: ${newGoal}`);
  await runMcpDeck(session, { providerId, goal: seededGoal });
}
