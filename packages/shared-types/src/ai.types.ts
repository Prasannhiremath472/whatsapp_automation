import { z } from "zod";

export interface AiProviderInfo {
  id: "anthropic" | "openai";
  label: string;
  keyHint: string;
  keyUrl: string;
  defaultModel: string;
  models: readonly { id: string; label: string }[];
}

/** The AI companies a business can connect with its own API key. */
export const AI_PROVIDERS: readonly AiProviderInfo[] = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    keyHint: "sk-ant-…",
    keyUrl: "console.anthropic.com",
    defaultModel: "claude-haiku-5-5",
    models: [
      { id: "claude-haiku-5-5", label: "Claude Haiku 5.5: fastest and cheapest" },
      { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5: balanced" },
      { id: "claude-opus-5-5", label: "Claude Opus 5.5: most capable" },
    ],
  },
  {
    id: "openai",
    label: "OpenAI (GPT)",
    keyHint: "sk-…",
    keyUrl: "platform.openai.com/api-keys",
    defaultModel: "gpt-4o-mini",
    models: [
      { id: "gpt-4o-mini", label: "GPT-4o mini: fast and cheap" },
      { id: "gpt-4o", label: "GPT-4o: balanced" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
      { id: "gpt-4.1", label: "GPT-4.1: most capable" },
    ],
  },
];
export const AiProviderSchema = z.enum(["anthropic", "openai"]);
export type AiProvider = z.infer<typeof AiProviderSchema>;

export const providerOf = (model: string): AiProvider => (model.startsWith("claude-") ? "anthropic" : "openai");

/** Any model name the provider accepts (the lists above are only suggestions). */
export const AiModelSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{1,99}$/, "Enter a valid model name");

/** DTO for PUT /ai/settings/key */
export const SetAiKeyRequestSchema = z
  .object({
    provider: AiProviderSchema.default("anthropic"),
    apiKey: z.string().trim().min(20).max(300),
  })
  .superRefine((v, ctx) => {
    if (v.provider === "anthropic" && !v.apiKey.startsWith("sk-ant-")) {
      ctx.addIssue({ code: "custom", path: ["apiKey"], message: "An Anthropic key starts with sk-ant-" });
    }
    if (v.provider === "openai" && (!v.apiKey.startsWith("sk-") || v.apiKey.startsWith("sk-ant-"))) {
      ctx.addIssue({ code: "custom", path: ["apiKey"], message: "An OpenAI key starts with sk-" });
    }
  });
export type SetAiKeyRequest = z.infer<typeof SetAiKeyRequestSchema>;

export interface AiSettingsDto {
  /** The company whose key is saved (Anthropic when none is saved yet). */
  provider: AiProvider;
  hasKey: boolean;
  keyLast4: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

/** DTO for POST /ai/agents and PUT /ai/agents/:id */
export const SaveAiAgentRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  instructions: z.string().trim().min(10, "Describe what the agent should do").max(8000),
  /** Defaults to the connected provider's cheapest model. */
  model: AiModelSchema.optional(),
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
