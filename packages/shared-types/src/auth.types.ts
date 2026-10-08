import { z } from "zod";
import { UserSchema } from "./user.types";

/** DTO for POST /auth/login and POST /auth/register */
export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const AuthResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: UserSchema,
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

export const RefreshRequestSchema = z.object({
  refreshToken: z.string(),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const LogoutRequestSchema = z.object({
  refreshToken: z.string(),
});
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;

/**
 * Shape of the payload encoded into the access JWT.
 * tenantId is nullable because super_admin users are not scoped to a tenant.
 */
export const JwtClaimsSchema = z.object({
  sub: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  role: z.enum(["super_admin", "tenant_admin", "agent"]),
  email: z.string().email(),
});
export type JwtClaims = z.infer<typeof JwtClaimsSchema>;
