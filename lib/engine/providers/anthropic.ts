import Anthropic from "@anthropic-ai/sdk";
import type {
  AgentTurnInvoker,
  StopReason,
  TurnEvent,
  UsageMetadata,
} from "./types";
import type { AgentMessage, ToolDefinition } from "../tools/types";

const MAX_TOKENS = 4096;

/**
 * Anthropic agent turn (one LLM call). Streams text + tool calls.
 * Uses the beta prompt-caching endpoint with cache_control: ephemeral on
 * the system prompt so it caches across loop iterations.
 */
export function createAnthropicAgent(model: string): AgentTurnInvoker {
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
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

      const client = new Anthropic({ apiKey });

      const apiMessages = messages.map(toAnthropicMessage);
      const apiTools = tools.map(toAnthropicTool);

      const apiStream = client.beta.promptCaching.messages.stream({
        model,
        max_tokens: MAX_TOKENS,
        system: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: apiTools,
        messages: apiMessages,
      });

      const toolBlocks = new Map<
        number,
        { id: string; name: string; jsonBuffer: string }
      >();

      try {
        for await (const event of apiStream) {
          if (event.type === "content_block_start") {
            const block = event.content_block;
            if (block.type === "tool_use") {
              toolBlocks.set(event.index, {
                id: block.id,
                name: block.name,
                jsonBuffer: "",
              });
            }
          } else if (event.type === "content_block_delta") {
            if (event.delta.type === "text_delta") {
              yield { type: "text", delta: event.delta.text };
            } else if (event.delta.type === "input_json_delta") {
              const tb = toolBlocks.get(event.index);
              if (tb) tb.jsonBuffer += event.delta.partial_json;
            }
          } else if (event.type === "content_block_stop") {
            const tb = toolBlocks.get(event.index);
            if (tb) {
              const parsed = safeParseJson(tb.jsonBuffer);
              yield {
                type: "tool_call",
                call: { id: tb.id, name: tb.name, input: parsed },
              };
              toolBlocks.delete(event.index);
            }
          }
        }

        const final = await apiStream.finalMessage();
        const u = final.usage;
        const cacheRead = (u as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0;
        const cacheWrite = (u as { cache_creation_input_tokens?: number }).cache_creation_input_tokens ?? 0;
        resolveDone({
          usage: {
            inputTokens: u.input_tokens + cacheRead + cacheWrite,
            outputTokens: u.output_tokens,
            cacheReadTokens: cacheRead,
            cacheWriteTokens: cacheWrite,
          },
          stopReason: mapStopReason(final.stop_reason),
        });
      } catch (err) {
        rejectDone(err);
        throw err;
      }
    }

    return { stream: streamGen(), done: () => donePromise };
  };
}

function toAnthropicTool(t: ToolDefinition) {
  return {
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  };
}

type AnthropicMsg = {
  role: "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
        | {
            type: "tool_result";
            tool_use_id: string;
            content: string;
            is_error?: boolean;
          }
      >;
};

function toAnthropicMessage(m: AgentMessage): AnthropicMsg {
  if (m.role === "user") {
    return { role: "user", content: m.content };
  }
  if (m.role === "assistant") {
    const blocks: Array<
      | { type: "text"; text: string }
      | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
    > = [];
    if (m.content && m.content.trim().length > 0) {
      blocks.push({ type: "text", text: m.content });
    }
    for (const tc of m.toolCalls ?? []) {
      blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
    }
    return {
      role: "assistant",
      content: blocks.length > 0 ? blocks : [{ type: "text", text: "" }],
    };
  }
  // tool_result blocks ride inside a user message per Anthropic's API
  return {
    role: "user",
    content: m.results.map((r) => ({
      type: "tool_result" as const,
      tool_use_id: r.toolCallId,
      content: r.content,
      is_error: r.isError || undefined,
    })),
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

function mapStopReason(raw: string | null | undefined): StopReason {
  switch (raw) {
    case "tool_use":
      return "tool_use";
    case "end_turn":
    case "stop_sequence":
      return "end_turn";
    case "max_tokens":
      return "max_tokens";
    default:
      return "other";
  }
}
