import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * Defence-in-depth guard: when a route has a `:tenantId` param, verifies it
 * matches the caller's JWT tenantId. super_admin (tenantId === null on the
 * JWT) is exempt since they're allowed to act across tenants.
 *
 * Handlers should still prefer deriving tenantId from the JWT directly
 * (via @CurrentTenant()) rather than trusting the route param at all — this
 * guard is a safety net for routes that do accept :tenantId.
 */
@Injectable()
export class TenantScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const routeTenantId = request.params?.tenantId;
    const user = request.user;

    if (!routeTenantId) {
      return true;
    }

    if (!user) {
      return false;
    }

    if (user.role === 'super_admin') {
      return true;
    }

    if (user.tenantId !== routeTenantId) {
      throw new ForbiddenException('Cannot access resources outside your tenant');
    }

    return true;
  }
}
