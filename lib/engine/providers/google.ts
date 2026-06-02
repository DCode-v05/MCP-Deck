import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import type {
  AgentTurnInvoker,
  StopReason,
  TurnEvent,
  UsageMetadata,
} from "./types";
import type {
  AgentMessage,
  JsonSchemaProperty,
  ToolDefinition,
} from "../tools/types";

/**
 * Google Gemini agent turn. Gemini doesn't issue stable tool-call ids,
 * so we synthesize them so run-engine can correlate calls and results.
 */
let synthIdCounter = 0;
function synthId(name: string): string {
  synthIdCounter++;
  return `gem_${synthIdCounter}_${name}`;
}

export function createGoogleAgent(model: string): AgentTurnInvoker {
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
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) throw new Error("GOOGLE_API_KEY is not set");

      const genAI = new GoogleGenerativeAI(apiKey);
      const genModel = genAI.getGenerativeModel({
        model,
        systemInstruction: systemPrompt,
        tools: [{ functionDeclarations: tools.map(toGoogleTool) }],
      });

      const contents = toGoogleContents(messages);

      try {
        const result = await genModel.generateContentStream({ contents });

        let sawToolCall = false;
        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) yield { type: "text", delta: text };

          const cand = chunk.candidates?.[0];
          for (const part of cand?.content?.parts ?? []) {
            const fc = (part as { functionCall?: { name: string; args: Record<string, unknown> } })
              .functionCall;
            if (fc) {
              sawToolCall = true;
              yield {
                type: "tool_call",
                call: { id: synthId(fc.name), name: fc.name, input: fc.args ?? {} },
              };
            }
          }
        }

        const finalResponse = await result.response;
        const meta = finalResponse.usageMetadata;
        const cacheRead = meta
          ? (meta as { cachedContentTokenCount?: number }).cachedContentTokenCount ?? 0
          : 0;
        const usage: UsageMetadata = meta
          ? {
              inputTokens: meta.promptTokenCount,
              outputTokens: meta.candidatesTokenCount ?? 0,
              cacheReadTokens: cacheRead,
              cacheWriteTokens: 0,
            }
          : { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

        const finishReason = finalResponse.candidates?.[0]?.finishReason ?? "";
        let stopReason: StopReason;
        if (sawToolCall) stopReason = "tool_use";
        else if (finishReason === "STOP") stopReason = "end_turn";
        else if (finishReason === "MAX_TOKENS") stopReason = "max_tokens";
        else stopReason = "other";

        resolveDone({ usage, stopReason });
      } catch (err) {
        rejectDone(err);
        throw err;
      }
    }

    return { stream: streamGen(), done: () => donePromise };
  };
}

function toGoogleTool(t: ToolDefinition) {
  return {
    name: t.name,
    description: t.description,
    parameters: {
      type: SchemaType.OBJECT,
      properties: Object.fromEntries(
        Object.entries(t.input_schema.properties).map(([k, v]) => [k, toGoogleSchema(v)]),
      ),
      required: t.input_schema.required ?? [],
    },
  };
}

function toGoogleSchema(p: JsonSchemaProperty): Record<string, unknown> {
  const base: Record<string, unknown> = {
    type: mapSchemaType(p.type),
    ...(p.description ? { description: p.description } : {}),
  };
  if (p.enum) base.enum = p.enum;
  if (p.items) base.items = toGoogleSchema(p.items);
  return base;
}

function mapSchemaType(t: JsonSchemaProperty["type"]): SchemaType {
  switch (t) {
    case "string": return SchemaType.STRING;
    case "number": return SchemaType.NUMBER;
    case "boolean": return SchemaType.BOOLEAN;
    case "object": return SchemaType.OBJECT;
    case "array": return SchemaType.ARRAY;
  }
}

type GoogleContent = {
  role: "user" | "model" | "function";
  parts: Array<
    | { text: string }
    | { functionCall: { name: string; args: Record<string, unknown> } }
    | { functionResponse: { name: string; response: Record<string, unknown> } }
  >;
};

function toGoogleContents(messages: AgentMessage[]): GoogleContent[] {
  const out: GoogleContent[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", parts: [{ text: m.content }] });
    } else if (m.role === "assistant") {
      const parts: GoogleContent["parts"] = [];
      if (m.content && m.content.trim().length > 0) parts.push({ text: m.content });
      for (const tc of m.toolCalls ?? []) {
        parts.push({ functionCall: { name: tc.name, args: tc.input } });
      }
      if (parts.length === 0) parts.push({ text: "" });
      out.push({ role: "model", parts });
    } else {
      const parts = m.results.map((r) => ({
        functionResponse: {
          name: r.name,
          response: r.isError ? { error: r.content } : { result: r.content },
        },
      }));
      if (parts.length > 0) out.push({ role: "function", parts });
    }
  }
  return out;
}
