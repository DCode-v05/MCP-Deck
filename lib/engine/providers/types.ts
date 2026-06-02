import type { ToolDefinition, AgentMessage, ToolCall } from "../tools/types";

export interface UsageMetadata {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export type TurnEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; call: ToolCall };

export interface TurnResult {
  stream: AsyncGenerator<TurnEvent>;
  done(): Promise<{ usage: UsageMetadata; stopReason: StopReason }>;
}

export type StopReason = "tool_use" | "end_turn" | "max_tokens" | "other";

export type AgentTurnInvoker = (
  systemPrompt: string,
  messages: AgentMessage[],
  tools: ToolDefinition[],
) => TurnResult;
