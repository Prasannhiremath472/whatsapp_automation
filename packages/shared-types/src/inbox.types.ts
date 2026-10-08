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
