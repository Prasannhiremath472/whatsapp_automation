import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extracts the authenticated user's tenantId (nullable for super_admin)
 * directly from the JWT claims on the request. Prefer this over reading
 * tenantId from route params/body for any "my own tenant" style endpoint.
 */
export const CurrentTenant = createParamDecorator((_data: unknown, ctx: ExecutionContext): string | null => {
  const request = ctx.switchToHttp().getRequest();
  return request.user?.tenantId ?? null;
});
