import { z } from "zod";

export const AUTOMATION_TRIGGERS = ["first_message", "keyword", "any_message"] as const;
export const AutomationTriggerSchema = z.enum(AUTOMATION_TRIGGERS);
export type AutomationTrigger = z.infer<typeof AutomationTriggerSchema>;

export const AutomationStatusSchema = z.enum(["draft", "active", "paused"]);
export type AutomationStatus = z.infer<typeof AutomationStatusSchema>;

export const TriggerConfigSchema = z.object({
  keywords: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  match: z.enum(["contains", "equals"]).default("contains"),
});
export type TriggerConfig = z.infer<typeof TriggerConfigSchema>;

/** What an automation can do, in order. `wait` pauses the run before the next step. */
export const AutomationStepSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("send_text"), text: z.string().trim().min(1).max(1024) }),
  z.object({
    type: z.literal("send_template"),
    templateId: z.string().uuid(),
    bodyVars: z.array(z.string().trim().min(1).max(1000)).max(20).default([]),
  }),
  z.object({ type: z.literal("add_tag"), tag: z.string().trim().min(1).max(50) }),
  z.object({ type: z.literal("assign"), agentUserId: z.string().uuid().nullable() }),
  z.object({ type: z.literal("set_status"), status: z.enum(["open", "pending", "closed"]) }),
  z.object({ type: z.literal("wait"), minutes: z.number().int().min(1).max(60 * 24 * 7) }),
  /** Pause the AI agent for this chat so a person answers. */
  z.object({ type: z.literal("handover_human") }),
]);
export type AutomationStep = z.infer<typeof AutomationStepSchema>;

/** DTO for POST /automations and PUT /automations/:id */
export const SaveAutomationRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).optional(),
    triggerType: AutomationTriggerSchema,
    triggerConfig: TriggerConfigSchema.default({ keywords: [], match: "contains" }),
    steps: z.array(AutomationStepSchema).min(1, "Add at least one step").max(20),
    cooldownMinutes: z.number().int().min(0).max(60 * 24 * 30).default(60),
  })
  .superRefine((v, ctx) => {
    if (v.triggerType === "keyword" && v.triggerConfig.keywords.length === 0) {
      ctx.addIssue({ code: "custom", path: ["triggerConfig", "keywords"], message: "Add at least one keyword" });
    }
    if (v.steps[v.steps.length - 1]?.type === "wait") {
      ctx.addIssue({ code: "custom", path: ["steps"], message: "A wait cannot be the last step" });
    }
  });
export type SaveAutomationRequest = z.infer<typeof SaveAutomationRequestSchema>;

export const SetAutomationStatusRequestSchema = z.object({ status: z.enum(["active", "paused"]) });

export interface AutomationDto {
  id: string;
  name: string;
  description: string | null;
  status: AutomationStatus;
  triggerType: AutomationTrigger;
  triggerConfig: TriggerConfig;
  steps: AutomationStep[];
  cooldownMinutes: number;
  runCount: number;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRunDto {
  id: string;
  conversationId: string;
  contactName: string;
  status: "running" | "waiting" | "completed" | "failed";
  stepIndex: number;
  error: string | null;
  createdAt: string;
}

/** Lower-cases and removes punctuation/extra spaces so "Price?" matches "price". */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Whether an inbound message matches a keyword trigger. */
export function matchesKeywords(text: string, config: TriggerConfig): boolean {
  const message = normalizeText(text);
  if (!message) return false;
  return config.keywords.some((raw) => {
    const keyword = normalizeText(raw);
    if (!keyword) return false;
    if (config.match === "equals") return message === keyword;
    return ` ${message} `.includes(` ${keyword} `);
  });
}
