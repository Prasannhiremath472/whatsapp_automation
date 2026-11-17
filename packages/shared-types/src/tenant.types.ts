import { z } from "zod";

/**
 * Tenant lifecycle status.
 * - pending_onboarding: tenant created but not yet fully set up
 * - active: normal operating state
 * - suspended: access blocked (e.g. billing issue, abuse) but data retained
 */
export const TenantStatusSchema = z.enum([
  "active",
  "suspended",
  "pending_onboarding",
]);
export type TenantStatus = z.infer<typeof TenantStatusSchema>;

export const TenantSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
  business_category: z.string().nullable(),
  status: TenantStatusSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Tenant = z.infer<typeof TenantSchema>;

/** DTO for POST /tenants */
export const CreateTenantRequestSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  business_category: z.string().nullable().optional(),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
  adminDisplayName: z.string().min(1),
});
export type CreateTenantRequest = z.infer<typeof CreateTenantRequestSchema>;

/** DTO for PATCH /tenants/:id */
export const UpdateTenantRequestSchema = z.object({
  name: z.string().min(1).optional(),
  business_category: z.string().nullable().optional(),
  status: TenantStatusSchema.optional(),
});
export type UpdateTenantRequest = z.infer<typeof UpdateTenantRequestSchema>;

/** True when `tz` is an IANA time zone this runtime understands (e.g. Asia/Kolkata). */
function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** DTO for PATCH /tenants/me (a business admin edits their own business). */
export const UpdateMyTenantRequestSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  business_category: z.string().trim().max(100).nullable().optional(),
  timezone: z.string().trim().refine(isTimeZone, "Unknown time zone").optional(),
});
export type UpdateMyTenantRequest = z.infer<typeof UpdateMyTenantRequestSchema>;
