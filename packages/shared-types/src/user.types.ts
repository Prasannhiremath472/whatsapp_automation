import { z } from "zod";

/**
 * Platform-wide roles.
 * - super_admin: manages all tenants, not scoped to any single tenant
 * - tenant_admin: manages a single tenant (users, settings, etc.)
 * - agent: operates within a single tenant (day-to-day CRM usage)
 */
export const UserRoleSchema = z.enum(["super_admin", "tenant_admin", "agent"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

/**
 * User shape sent to the frontend / returned by the API.
 * MUST NOT include passwordHash or any other credential material.
 */
export const UserSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  email: z.string().email(),
  role: UserRoleSchema,
  displayName: z.string(),
  isActive: z.boolean(),
  lastLoginAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type User = z.infer<typeof UserSchema>;

/** DTO for POST /users (tenant_admin creates an agent in their own tenant) */
export const CreateUserRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1),
  role: z.enum(["tenant_admin", "agent"]).optional().default("agent"),
});
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

/** DTO for PATCH /users/:id */
export const UpdateUserRequestSchema = z.object({
  isActive: z.boolean().optional(),
  displayName: z.string().min(1).optional(),
});
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;
