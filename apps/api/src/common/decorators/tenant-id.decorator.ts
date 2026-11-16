import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';

/**
 * Like @CurrentTenant(), but rejects accounts that are not attached to a
 * tenant (i.e. super_admin) instead of handing the handler a null. The id
 * always comes from the verified JWT — never from the request body or URL.
 */
export const TenantId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  const tenantId: string | null | undefined = request.user?.tenantId;
  if (!tenantId) {
    throw new ForbiddenException('This account is not associated with a tenant');
  }
  return tenantId;
});
