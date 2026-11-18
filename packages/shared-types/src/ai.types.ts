import { z } from "zod";

/** Claude models an agent can use (cheapest first). */
export const AI_MODELS = [
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5: fastest and cheapest" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5: balanced" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5: most capable" },
] as const;
export const AiModelSchema = z.enum(["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"]);

/** DTO for PUT /ai/settings/key */
export const SetAnthropicKeyRequestSchema = z.object({
  apiKey: z.string().trim().min(20).max(300).regex(/^sk-ant-/, "An Anthropic key starts with sk-ant-"),
});

export interface AiSettingsDto {
  hasKey: boolean;
  keyLast4: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

/** DTO for POST /ai/agents and PUT /ai/agents/:id */
export const SaveAiAgentRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  instructions: z.string().trim().min(10, "Describe what the agent should do").max(8000),
  model: AiModelSchema.default("claude-haiku-5-5"),
  handoverMessage: z.string().trim().min(1).max(500).default("Thanks! A member of our team will take over from here shortly."),
});
export type SaveAiAgentRequest = z.infer<typeof SaveAiAgentRequestSchema>;

export const SetAiAgentStatusRequestSchema = z.object({ status: z.enum(["active", "paused"]) });

export const SaveKnowledgeRequestSchema = z.object({
  title: z.string().trim().min(1).max(150),
  content: z.string().trim().min(1).max(6000),
});
export type SaveKnowledgeRequest = z.infer<typeof SaveKnowledgeRequestSchema>;

/** DTO for POST /ai/agents/:id/test (a dry run: nothing is sent to WhatsApp). */
export const TestAiAgentRequestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().min(1).max(2000) }))
    .min(1)
    .max(30),
});

export interface AiKnowledgeDto {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
}

export interface AiAgentDto {
  id: string;
  name: string;
  instructions: string;
  model: string;
  status: "active" | "paused";
  handoverMessage: string;
  knowledge: AiKnowledgeDto[];
  /** Last 30 days. */
  usage: { requests: number; inputTokens: number; outputTokens: number; handovers: number; errors: number };
  createdAt: string;
  updatedAt: string;
}

export interface AiTestReply {
  text: string;
  handedOver: boolean;
  inputTokens: number;
  outputTokens: number;
}
