import { createAnthropicAgent } from "./anthropic";
import { createGoogleAgent } from "./google";
import { createOpenAIAgent } from "./openai";
import type { AgentTurnInvoker } from "./types";

export type { AgentTurnInvoker } from "./types";

export type ProviderId =
  | "sonnet"
  | "haiku"
  | "gemini-3"
  | "gemini-3.1"
  | "gpt-5.4-mini"
  | "gpt-5.4"
  | "gpt-5.5";

export const PROVIDER_IDS: ProviderId[] = [
  "sonnet",
  "haiku",
  "gemini-3",
  "gemini-3.1",
  "gpt-5.4-mini",
  "gpt-5.4",
  "gpt-5.5",
];

const REGISTRY: Record<ProviderId, AgentTurnInvoker> = {
  sonnet: createAnthropicAgent("claude-sonnet-4-6"),
  haiku: createAnthropicAgent("claude-haiku-4-5-20251001"),
  "gemini-3": createGoogleAgent("gemini-3-flash-preview"),
  "gemini-3.1": createGoogleAgent("gemini-3.1-flash-lite-preview"),
  "gpt-5.4-mini": createOpenAIAgent("gpt-5.4-mini"),
  "gpt-5.4": createOpenAIAgent("gpt-5.4"),
  "gpt-5.5": createOpenAIAgent("gpt-5.5"),
};

export function getProvider(id: ProviderId): AgentTurnInvoker {
  const invoker = REGISTRY[id];
  if (!invoker) {
    throw new Error(`Unknown providerId: ${id}`);
  }
  return invoker;
}

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && PROVIDER_IDS.includes(value as ProviderId);
}
