import { z } from "zod";

/**
 * Milestone 3: multi-agent shared live inbox — message send / assignment /
 * status DTOs shared between apps/api and apps/web.
 */

export const ConversationStatusSchema = z.enum(["open", "pending", "closed"]);
export type ConversationStatus = z.infer<typeof ConversationStatusSchema>;

/** DTO for POST /conversations/:id/messages */
export const SendMessageRequestSchema = z.discriminatedUnion("messageType", [
  z.object({
    messageType: z.literal("text"),
    text: z.string().min(1),
  }),
  z.object({
    messageType: z.literal("image"),
    mediaId: z.string().min(1),
    caption: z.string().optional(),
  }),
  z.object({
    messageType: z.literal("document"),
    mediaId: z.string().min(1),
    caption: z.string().optional(),
    filename: z.string().optional(),
  }),
]);
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

/** DTO for PATCH /conversations/:id/assign */
export const AssignConversationRequestSchema = z.object({
  agentUserId: z.string().uuid().nullable(),
});
export type AssignConversationRequest = z.infer<typeof AssignConversationRequestSchema>;

/** DTO for PATCH /conversations/:id/status */
export const UpdateConversationStatusRequestSchema = z.object({
  status: ConversationStatusSchema,
});
export type UpdateConversationStatusRequest = z.infer<typeof UpdateConversationStatusRequestSchema>;

/** DTO for POST /conversations/:id/template-messages (reply with an approved template, e.g. after the 24-hour window). */
export const SendTemplateMessageRequestSchema = z.object({
  templateId: z.string().uuid(),
  bodyVars: z.array(z.string().trim().min(1).max(1000)).max(20).default([]),
  headerVars: z.array(z.string().trim().min(1).max(1000)).max(1).default([]),
  /** Only for image/video/document headers; defaults to the template's own image. */
  headerMediaUrl: z
    .string()
    .trim()
    .max(2000)
    .regex(/^https:\/\/\S+$/, "Use a public https:// link")
    .optional(),
});
export type SendTemplateMessageRequest = z.infer<typeof SendTemplateMessageRequestSchema>;

/** One line of plain text describing a stored message (conversation list preview and chat bubble). */
export function describeMessage(messageType: string, content: unknown): string {
  const c = (content ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  switch (messageType) {
    case "text":
    case "template":
      return str(c["body"]);
    case "image":
      return ["📷 Photo", str(c["caption"])].filter(Boolean).join(" ");
    case "video":
      return ["🎥 Video", str(c["caption"])].filter(Boolean).join(" ");
    case "document":
      return ["📄", str(c["filename"]) || "Document", str(c["caption"])].filter(Boolean).join(" ");
    case "audio":
      return "🎤 Voice message";
    case "interactive_button":
    case "interactive_list":
      return str(c["title"]) || str(c["body"]) || "Selected an option";
    default:
      return str(c["body"]) || str(c["text"]) || messageType.replace(/_/g, " ");
  }
}
