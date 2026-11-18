import { z } from "zod";

/** What an API key may do. A key only gets the scopes it was created with. */
export const API_SCOPES = [
  { id: "messages:send", label: "Send WhatsApp messages" },
  { id: "messages:read", label: "Read message status" },
  { id: "contacts:read", label: "Read contacts" },
  { id: "contacts:write", label: "Create and update contacts" },
  { id: "templates:read", label: "Read approved templates" },
] as const;
export const ApiScopeSchema = z.enum(["messages:send", "messages:read", "contacts:read", "contacts:write", "templates:read"]);
export type ApiScope = z.infer<typeof ApiScopeSchema>;

/** DTO for POST /api-keys */
export const CreateApiKeyRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(ApiScopeSchema).min(1, "Choose at least one permission").max(10),
  /** Days until the key stops working; omit for no expiry. */
  expiresInDays: z.number().int().min(1).max(730).optional(),
});
export type CreateApiKeyRequest = z.infer<typeof CreateApiKeyRequestSchema>;

export interface ApiKeyDto {
  id: string;
  name: string;
  /** Start of the key, enough to recognise it ("gk_live_a1b2c3d4"). */
  prefix: string;
  scopes: ApiScope[];
  lastUsedAt: string | null;
  requestCount: number;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** Returned once, when the key is created. */
export interface ApiKeyWithSecretDto extends ApiKeyDto {
  secret: string;
}

export interface ApiRequestLogDto {
  id: string;
  apiKeyId: string | null;
  apiKeyName: string | null;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  ip: string | null;
  error: string | null;
  createdAt: string;
}

export interface ApiLogSummaryDto {
  /** Last 24 hours. */
  requests: number;
  errors: number;
  avgDurationMs: number;
}

/** Body of POST /public/v1/messages */
export const PublicSendMessageSchema = z.discriminatedUnion("type", [
  z.object({
    to: z.string().trim().min(5).max(40),
    type: z.literal("template"),
    template: z.object({
      name: z.string().trim().min(1).max(100),
      language: z.string().trim().max(10).default("en"),
      /** Values for {{1}}, {{2}} ... in the body, in order. */
      variables: z.array(z.string().trim().min(1).max(1000)).max(20).default([]),
      /** For templates with an image/video/document header. */
      headerMediaUrl: z.string().trim().max(2000).regex(/^https:\/\/\S+$/, "Use a public https:// link").optional(),
    }),
    /** Country code to add to numbers written without one, e.g. "91". */
    defaultCountryCode: z.string().regex(/^\d{1,4}$/).optional(),
  }),
  z.object({
    to: z.string().trim().min(5).max(40),
    type: z.literal("text"),
    text: z.string().trim().min(1).max(4096),
    defaultCountryCode: z.string().regex(/^\d{1,4}$/).optional(),
  }),
]);
export type PublicSendMessage = z.infer<typeof PublicSendMessageSchema>;

/** Body of POST /public/v1/contacts (creates the contact, or updates it when the number already exists). */
export const PublicUpsertContactSchema = z.object({
  phone: z.string().trim().min(5).max(40),
  name: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().email().max(191).optional(),
  location: z.string().trim().max(100).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(50).optional(),
  defaultCountryCode: z.string().regex(/^\d{1,4}$/).optional(),
});
export type PublicUpsertContact = z.infer<typeof PublicUpsertContactSchema>;
