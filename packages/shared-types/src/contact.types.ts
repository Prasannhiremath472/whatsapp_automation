import { z } from "zod";
import { PaginationQuerySchema } from "./common.types";

const tagName = z.string().trim().min(1).max(50);

/** Contact as returned by the API. `phone` is the WhatsApp id (digits, with country code). */
export const ContactSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  location: z.string().nullable(),
  leadStatus: z.string(),
  source: z.string(),
  notes: z.string().nullable(),
  assignedUserId: z.string().uuid().nullable(),
  assignedUserName: z.string().nullable(),
  tags: z.array(z.string()),
  optedOut: z.boolean(),
  lastInteractionAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ContactDto = z.infer<typeof ContactSchema>;

/** DTO for POST /contacts */
export const CreateContactRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(1).max(40),
  email: z.string().trim().email().max(191).optional().or(z.literal("")),
  location: z.string().trim().max(100).optional(),
  leadStatus: z.string().trim().min(1).max(50).optional(),
  source: z.string().trim().min(1).max(50).optional(),
  notes: z.string().max(5000).optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
  tags: z.array(tagName).max(50).optional(),
  /** Country code applied to national-format numbers, e.g. "91". */
  defaultCountryCode: z.string().regex(/^\d{1,4}$/).optional(),
});
export type CreateContactRequest = z.infer<typeof CreateContactRequestSchema>;

/** DTO for PATCH /contacts/:id (every field optional). */
export const UpdateContactRequestSchema = CreateContactRequestSchema.partial().extend({
  optedOut: z.boolean().optional(),
});
export type UpdateContactRequest = z.infer<typeof UpdateContactRequestSchema>;

/** Query for GET /contacts */
export const ListContactsQuerySchema = PaginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  tag: z.string().trim().max(50).optional(),
  location: z.string().trim().max(100).optional(),
  leadStatus: z.string().trim().max(50).optional(),
  optedOut: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});
export type ListContactsQuery = z.infer<typeof ListContactsQuerySchema>;

export const ImportContactRowSchema = z.object({
  name: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40),
  email: z.string().trim().max(191).optional(),
  location: z.string().trim().max(100).optional(),
  leadStatus: z.string().trim().max(50).optional(),
  tags: z.array(tagName).max(50).optional(),
});
export type ImportContactRow = z.infer<typeof ImportContactRowSchema>;

/**
 * DTO for POST /contacts/import. The CSV is parsed in the browser; the API
 * receives validated rows in chunks (<= 2000 per request).
 */
export const ImportContactsRequestSchema = z.object({
  rows: z.array(ImportContactRowSchema).min(1).max(2000),
  defaultCountryCode: z.string().regex(/^\d{1,4}$/).optional(),
  /** Tags applied to every row in addition to the row's own tags. */
  tags: z.array(tagName).max(20).optional(),
  /** When false, rows whose number already exists are skipped instead of updated. */
  updateExisting: z.boolean().default(true),
  /** The uploader must confirm the contacts agreed to receive WhatsApp messages. */
  consentConfirmed: z.literal(true, {
    errorMap: () => ({ message: "You must confirm that these contacts opted in to receive WhatsApp messages" }),
  }),
});
export type ImportContactsRequest = z.infer<typeof ImportContactsRequestSchema>;

export interface ImportContactsResult {
  created: number;
  updated: number;
  skipped: number;
  invalid: { row: number; phone: string; reason: string }[];
}

/** DTO for POST /contacts/bulk-tags */
export const BulkTagRequestSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1).max(1000),
  tag: tagName,
  action: z.enum(["add", "remove"]).default("add"),
});
export type BulkTagRequest = z.infer<typeof BulkTagRequestSchema>;

/** DTO for POST /contacts/bulk-delete */
export const BulkDeleteContactsRequestSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1).max(1000),
});
export type BulkDeleteContactsRequest = z.infer<typeof BulkDeleteContactsRequestSchema>;
