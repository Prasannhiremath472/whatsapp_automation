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
