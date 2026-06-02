import { getProvider, type ProviderId } from "@/lib/engine/providers";
import type { AgentMessage, ToolCall, ToolDefinition } from "@/lib/engine/tools";
import { makeId, type McpDeckSession } from "./session";

const MAX_ITERATIONS = 6;

export interface McpDeckRunOpts {
  providerId: ProviderId;
  goal: string;
}

type ReadContext = ReturnType<McpDeckSession["readContext"]>;

function buildSystemPrompt(session: McpDeckSession, opts: McpDeckRunOpts, ctx: ReadContext): string {
  const lines: string[] = [
    `You are McpDeck, an agent that uses MCP tools to accomplish a goal.`,
    ``,
    `GOAL: ${opts.goal}`,
    ``,
    `# Loop contract`,
    `Each iteration you receive a fresh snapshot of project + server state below.`,
    `Use that snapshot to decide the next tool call. Every tool call passes through a user approval gate — that is expected.`,
    `Prefer pinned tools when they fit. Call \`finish\` with a short summary when the goal is met.`,
    `Keep narration brief — 1-2 sentences between tool calls.`,
    ``,
    `# Current MCP state (just read from the session)`,
    ``,
    `Servers enabled:`,
  ];
  for (const s of ctx.enabledServers) {
    const info = session.findServerInfo(s);
    if (info) lines.push(`  - ${info.id}: ${info.description}`);
  }
  if (ctx.enabledServers.length === 0) {
    lines.push(`  (none — the user has disabled every server; call finish with an explanation)`);
  }

  if (ctx.pinnedTools.length > 0) {
    lines.push(``, `Pinned tools (the user wants these preferred):`);
    for (const t of ctx.pinnedTools) lines.push(`  - ${t}`);
  }

  if (ctx.openResources.length > 0) {
    lines.push(``, `Resources the user has opened (hint about their interest):`);
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
    return `Reading project state: ${enabled}${
      ctx.pinnedTools.length > 0 ? ` · ${ctx.pinnedTools.length} pinned tool(s)` : ""
    }. Planning the first tool call.`;
  }
  const lastCall = ctx.recentCalls[ctx.recentCalls.length - 1];
  if (lastCall) {
    return `Conditioning on ${lastCall.toolId} result. Deciding the next step (iteration ${iteration}/${totalIterations}).`;
  }
  return `Re-reading session state (iteration ${iteration}/${totalIterations}).`;
}

function toolDefsForSession(session: McpDeckSession): ToolDefinition[] {
  const enabled = new Set(session.enabledServerIds());
  const defs: ToolDefinition[] = session.toolInfos().filter((t) => enabled.has(t.serverId)).map((t) => ({
    name: t.id.replace(".", "__"),
    description: `[${t.serverId}] ${t.description}${t.hasSideEffect ? " (side effect — requires approval)" : ""}`,
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
    name: "finish",
    description: "Mark the goal as complete and emit a one-paragraph summary.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Plain-language outcome." },
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

export async function runMcpDeck(
  session: McpDeckSession,
  opts: McpDeckRunOpts,
): Promise<void> {
  session.goal = opts.goal;
  session.status = "running";
  session.emit({ type: "engine_iteration", iteration: 0, goal: opts.goal });
  session.logEvent("info", `goal: ${opts.goal}`);

  const provider = getProvider(opts.providerId);
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

      // ── The "in between" step: the loop reads live MCP state, broadcasts
      //    what it just read as a thought, then folds it into the prompt.
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
      const turn = provider(systemPrompt, messages, tools);

      let assistantText = "";
      const turnToolCalls: ToolCall[] = [];

      for await (const ev of turn.stream) {
        if (ev.type === "text") {
          assistantText += ev.delta;
          session.emit({ type: "engine_text", text: ev.delta });
        } else if (ev.type === "tool_call") {
          turnToolCalls.push(ev.call);
        }
      }

      const { usage, stopReason } = await turn.done();
      totalInput += usage.inputTokens;
      totalOutput += usage.outputTokens;
      session.recordEngineUsage(
        totalInput,
        totalOutput,
        estimateCost(opts.providerId, totalInput, totalOutput),
      );

      if (turnToolCalls.length === 0) {
        session.logEvent("warn", `iteration ${iteration} produced no tool call (stop=${stopReason})`);
        break;
      }

      messages.push({ role: "assistant", content: assistantText, toolCalls: turnToolCalls });

      const toolResults = [];
      let didFinish = false;
      let finishSummary: string | null = null;

      for (const call of turnToolCalls) {
        if (call.name === "finish") {
          didFinish = true;
          finishSummary = String((call.input as Record<string, unknown>).summary ?? "Done.");
          toolResults.push({
            toolCallId: call.id,
            name: call.name,
            content: "completed",
            isError: false,
          });
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

        // -- Pause-on-approval primitive --
        const requestId = makeId("apr");
        const verdict = await session.awaitApproval({
          requestId,
          serverId: tool.serverId,
          toolId: tool.id,
          args: (call.input ?? {}) as Record<string, unknown>,
        });

        if (verdict.kind === "deny") {
          toolResults.push({
            toolCallId: call.id,
            name: call.name,
            content: `User denied this tool call.${verdict.reason ? ` Reason: ${verdict.reason}` : ""} Reconsider and try a different approach.`,
            isError: true,
          });
          session.logEvent("info", `denied ${tool.id}`);
          continue;
        }

        const finalArgs = verdict.args;
        const argsEdited =
          JSON.stringify(finalArgs) !== JSON.stringify(call.input ?? {});

        const replay = session.recordToolStart({
          id: makeId("rep"),
          iteration,
          serverId: tool.serverId,
          toolId: tool.id,
          args: finalArgs,
          argsEdited,
          verdict: verdict.kind === "approve_remember" ? "approved" : verdict.kind === "approve" ? "approved" : "denied",
          startedAt: Date.now(),
        });

        const exec = await session.callTool(tool.id, finalArgs);
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
      summary: `Reached max iterations (${MAX_ITERATIONS}).`,
    });
    session.emit({
      type: "usage",
      inputTokens: totalInput,
      outputTokens: totalOutput,
      totalCost: estimateCost(opts.providerId, totalInput, totalOutput),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    session.status = "error";
    session.logEvent("error", msg);
    session.emit({ type: "engine_done", reason: "error", summary: msg });
  }
}

function estimateCost(providerId: ProviderId, inputTokens: number, outputTokens: number): number {
  // Rough per-MTok pricing for the default model. Real numbers live in pricing.ts;
  // duplicating a coarse estimate here keeps McpDeck self-contained.
  const rates: Record<string, { input: number; output: number }> = {
    sonnet: { input: 3, output: 15 },
    haiku: { input: 1, output: 5 },
  };
  const r = rates[providerId] ?? rates.sonnet;
  return (inputTokens / 1_000_000) * r.input + (outputTokens / 1_000_000) * r.output;
}

/**
 * Replay: re-execute a past tool call (optionally with edited args). No LLM —
 * this is a deterministic re-run, recorded as a fresh replay entry so the
 * timeline shows the new result alongside the original.
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
 * results up to (and including) the chosen call as prior context. Lets the
 * user fork the investigation from a past point with a new instruction.
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
