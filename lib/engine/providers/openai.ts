import OpenAI from "openai";
import type {
  AgentTurnInvoker,
  StopReason,
  TurnEvent,
  UsageMetadata,
} from "./types";
import type { AgentMessage, ToolDefinition } from "../tools/types";

const MAX_OUTPUT_TOKENS = 16384;

/**
 * OpenAI agent turn via the Responses API (`/v1/responses`). GPT-5 family
 * rejects `reasoning_effort` + `tools` on chat completions, so we use
 * Responses with `reasoning.effort: "none"` — the cheapest tier, fine for
 * our tool-dispatch loop.
 */
export function createOpenAIAgent(model: string): AgentTurnInvoker {
  return (systemPrompt, messages, tools) => {
    let resolveDone!: (v: { usage: UsageMetadata; stopReason: StopReason }) => void;
    let rejectDone!: (err: unknown) => void;
    const donePromise = new Promise<{ usage: UsageMetadata; stopReason: StopReason }>(
      (res, rej) => {
        resolveDone = res;
        rejectDone = rej;
      },
    );

    async function* streamGen(): AsyncGenerator<TurnEvent> {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

      const client = new OpenAI({ apiKey });

      const input = toResponsesInput(messages);
      const apiTools = tools.map(toResponsesTool);

      try {
        const stream = await client.responses.create({
          model,
          instructions: systemPrompt,
          input,
          tools: apiTools,
          // "none" disables reasoning entirely. SDK ^4.104 types only know
          // low/medium/high, but the API accepts "none" — cast required.
          reasoning: { effort: "none" as "low" },
          max_output_tokens: MAX_OUTPUT_TOKENS,
          stream: true,
        });

        const fnCalls = new Map<
          number,
          { call_id: string; name: string; args: string }
        >();

        let capturedUsage: UsageMetadata = {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        };
        let stopReason: StopReason = "other";

        for await (const event of stream) {
          switch (event.type) {
            case "response.output_item.added": {
              const item = (event as { item?: { type?: string; call_id?: string; name?: string } }).item;
              const idx = (event as { output_index?: number }).output_index ?? 0;
              if (item?.type === "function_call" && item.call_id && item.name) {
                fnCalls.set(idx, { call_id: item.call_id, name: item.name, args: "" });
              }
              break;
            }
            case "response.output_text.delta": {
              const delta = (event as { delta?: string }).delta ?? "";
              if (delta) yield { type: "text", delta };
              break;
            }
            case "response.function_call_arguments.delta": {
              const idx = (event as { output_index?: number }).output_index ?? 0;
              const delta = (event as { delta?: string }).delta ?? "";
              const fc = fnCalls.get(idx);
              if (fc) fc.args += delta;
              break;
            }
            case "response.output_item.done": {
              const idx = (event as { output_index?: number }).output_index ?? 0;
              const fc = fnCalls.get(idx);
              if (fc) {
                yield {
                  type: "tool_call",
                  call: {
                    id: fc.call_id,
                    name: fc.name,
                    input: safeParseJson(fc.args),
                  },
                };
                fnCalls.delete(idx);
              }
              break;
            }
            case "response.completed": {
              const resp = (event as { response?: ResponseFinal }).response;
              if (resp?.usage) {
                capturedUsage = {
                  inputTokens: resp.usage.input_tokens ?? 0,
                  outputTokens: resp.usage.output_tokens ?? 0,
                  cacheReadTokens:
                    resp.usage.input_tokens_details?.cached_tokens ?? 0,
                  cacheWriteTokens: 0,
                };
              }
              const hadToolCall = resp?.output?.some(
                (it) => it?.type === "function_call",
              );
              stopReason = hadToolCall ? "tool_use" : "end_turn";
              break;
            }
            case "response.failed":
            case "response.incomplete": {
              const resp = (event as { response?: ResponseFinal }).response;
              if (resp?.incomplete_details?.reason === "max_output_tokens") {
                stopReason = "max_tokens";
              } else {
                stopReason = "other";
              }
              if (resp?.usage) {
                capturedUsage = {
                  inputTokens: resp.usage.input_tokens ?? 0,
                  outputTokens: resp.usage.output_tokens ?? 0,
                  cacheReadTokens:
                    resp.usage.input_tokens_details?.cached_tokens ?? 0,
                  cacheWriteTokens: 0,
                };
              }
              break;
            }
            default:
              break;
          }
        }

        resolveDone({ usage: capturedUsage, stopReason });
      } catch (err) {
        rejectDone(err);
        throw err;
      }
    }

    return { stream: streamGen(), done: () => donePromise };
  };
}

type ResponseFinal = {
  output?: Array<{ type?: string } | null>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
  };
  incomplete_details?: { reason?: string };
};

type InputItem =
  | { role: "user" | "assistant" | "system" | "developer"; content: string }
  | {
      type: "function_call";
      call_id: string;
      name: string;
      arguments: string;
    }
  | {
      type: "function_call_output";
      call_id: string;
      output: string;
    };

function toResponsesInput(messages: AgentMessage[]): InputItem[] {
  const items: InputItem[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      items.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      if (m.content && m.content.trim()) {
        items.push({ role: "assistant", content: m.content });
      }
      for (const tc of m.toolCalls ?? []) {
        items.push({
          type: "function_call",
          call_id: tc.id,
          name: tc.name,
          arguments: JSON.stringify(tc.input),
        });
      }
    } else {
      for (const r of m.results) {
        items.push({
          type: "function_call_output",
          call_id: r.toolCallId,
          output: r.content,
        });
      }
    }
  }
  return items;
}

function toResponsesTool(t: ToolDefinition) {
  return {
    type: "function" as const,
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
    strict: false,
  };
}

function safeParseJson(s: string): Record<string, unknown> {
  if (!s.trim()) return {};
  try {
    const parsed = JSON.parse(s);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
