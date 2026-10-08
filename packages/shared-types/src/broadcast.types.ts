import { z } from "zod";

/**
 * Milestone 4: bulk broadcast/campaign DTOs shared between apps/api and
 * apps/web.
 */

/**
 * DTO for POST /broadcast-templates and PATCH /broadcast-templates/:id.
 * When metaTemplateName is set, this template sends via Meta's approved
 * WhatsApp Message Templates API (required for first-contact / outside the
 * 24h session window) instead of a free-text session message — body is
 * still stored for display purposes (e.g. showing a preview in the UI).
 */
export const SaveBroadcastTemplateRequestSchema = z.object({
  name: z.string().min(1).max(100),
  body: z.string().min(1).max(4096),
  metaTemplateName: z.string().min(1).max(512).optional(),
  metaTemplateLanguage: z.string().min(1).max(35).optional(),
  metaVariableCount: z.number().int().min(0).max(20).optional(),
});
export type SaveBroadcastTemplateRequest = z.infer<typeof SaveBroadcastTemplateRequestSchema>;

/**
 * One CSV-imported recipient: a raw phone number (WhatsApp id, digits with
 * country code, no +) plus an optional display name and the positional
 * {{1}}, {{2}}... values for a Meta template send, in order.
 */
export const BroadcastCsvRecipientSchema = z.object({
  waId: z.string().regex(/^\d{7,15}$/, "waId must be digits only with country code, e.g. 919876543210"),
  name: z.string().max(200).optional(),
  templateVariables: z.array(z.string().max(500)).optional(),
});
export type BroadcastCsvRecipient = z.infer<typeof BroadcastCsvRecipientSchema>;

/**
 * DTO for POST /broadcast-campaigns. Recipients come from existing
 * contacts (contactIds) and/or a CSV-style list of fresh numbers
 * (csvRecipients) — a campaign may use either or both; at least one
 * recipient overall is required.
 */
export const CreateBroadcastCampaignRequestSchema = z
  .object({
    name: z.string().min(1).max(150),
    templateId: z.string().uuid(),
    contactIds: z.array(z.string().uuid()).default([]),
    csvRecipients: z.array(BroadcastCsvRecipientSchema).default([]),
  })
  .refine((v) => v.contactIds.length + v.csvRecipients.length > 0, {
    message: "At least one recipient (contactIds or csvRecipients) is required",
  });
export type CreateBroadcastCampaignRequest = z.infer<typeof CreateBroadcastCampaignRequestSchema>;
