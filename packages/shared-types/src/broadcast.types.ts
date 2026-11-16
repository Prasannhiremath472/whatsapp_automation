import { z } from "zod";
import { PaginationQuerySchema } from "./common.types";

/**
 * Bulk WhatsApp messaging DTOs shared between apps/api and apps/web.
 * A campaign sends one APPROVED message template to an audience of contacts.
 */

export const CampaignStatusSchema = z.enum([
  "draft",
  "scheduled",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;

export const RecipientStatusSchema = z.enum(["pending", "sending", "sent", "delivered", "read", "failed", "skipped"]);
export type RecipientStatus = z.infer<typeof RecipientStatusSchema>;

/** Contact fields a template variable can be filled from. */
export const CONTACT_VARIABLE_FIELDS = ["name", "firstName", "phone", "email", "location"] as const;
export type ContactVariableField = (typeof CONTACT_VARIABLE_FIELDS)[number];

/** Where one template variable ({{n}}) gets its value for each recipient. */
export const VariableSourceSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("field"),
    field: z.enum(CONTACT_VARIABLE_FIELDS),
    /** Used when the contact has no value for `field`. */
    fallback: z.string().trim().max(200).optional(),
  }),
  z.object({
    source: z.literal("static"),
    value: z.string().trim().min(1).max(1000),
  }),
]);
export type VariableSource = z.infer<typeof VariableSourceSchema>;

export const VariableMappingSchema = z.object({
  header: z.array(VariableSourceSchema).max(1).default([]),
  body: z.array(VariableSourceSchema).max(20).default([]),
});
export type VariableMapping = z.infer<typeof VariableMappingSchema>;

export const AudienceSchema = z
  .object({
    mode: z.enum(["all", "tags", "contacts"]),
    tags: z.array(z.string().trim().min(1).max(50)).max(50).default([]),
    contactIds: z.array(z.string().uuid()).max(100000).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.mode === "tags" && v.tags.length === 0) {
      ctx.addIssue({ code: "custom", path: ["tags"], message: "Choose at least one tag" });
    }
    if (v.mode === "contacts" && v.contactIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["contactIds"], message: "Choose at least one contact" });
    }
  });
export type Audience = z.infer<typeof AudienceSchema>;

/** Wall-clock schedule in the business's timezone (Tenant.timezone). */
export const ScheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm"),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

/** DTO for POST /campaigns and PATCH /campaigns/:id (draft campaigns only). */
export const SaveCampaignRequestSchema = z.object({
  name: z.string().trim().min(1).max(150),
  objective: z.string().trim().max(100).optional(),
  description: z.string().trim().max(2000).optional(),
  templateId: z.string().uuid(),
  audience: AudienceSchema,
  variableMapping: VariableMappingSchema.default({ header: [], body: [] }),
  headerMediaUrl: z.string().trim().url().max(2000).startsWith("https://", "Media URL must use https").optional(),
  /** null / omitted = send immediately when launched. */
  schedule: ScheduleSchema.nullable().optional(),
});
export type SaveCampaignRequest = z.infer<typeof SaveCampaignRequestSchema>;

/** DTO for POST /campaigns/audience-preview */
export const AudiencePreviewRequestSchema = z.object({ audience: AudienceSchema });
export type AudiencePreviewRequest = z.infer<typeof AudiencePreviewRequestSchema>;

export interface AudiencePreview {
  /** Contacts matching the audience definition. */
  total: number;
  /** Contacts that will actually receive the message (total minus opted-out). */
  eligible: number;
  optedOut: number;
  sample: { id: string; name: string; phone: string }[];
}

export const ListCampaignsQuerySchema = PaginationQuerySchema.extend({
  status: CampaignStatusSchema.optional(),
  q: z.string().trim().max(100).optional(),
});
export type ListCampaignsQuery = z.infer<typeof ListCampaignsQuerySchema>;

export const ListRecipientsQuerySchema = PaginationQuerySchema.extend({
  status: RecipientStatusSchema.optional(),
});
export type ListRecipientsQuery = z.infer<typeof ListRecipientsQuerySchema>;

export interface CampaignCounts {
  total: number;
  /** Accepted by WhatsApp (includes delivered and read). */
  sent: number;
  /** Delivered to the device (includes read). */
  delivered: number;
  read: number;
  failed: number;
  skipped: number;
  /** Still waiting to be sent. */
  pending: number;
}

export interface CampaignDto {
  id: string;
  name: string;
  objective: string | null;
  description: string | null;
  status: CampaignStatus;
  statusReason: string | null;
  templateId: string;
  templateName: string;
  audience: Audience;
  variableMapping: VariableMapping;
  headerMediaUrl: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  counts: CampaignCounts;
  createdAt: string;
}

export interface CampaignRecipientDto {
  id: string;
  contactId: string;
  name: string;
  phone: string;
  status: RecipientStatus;
  errorCode: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
}
