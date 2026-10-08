import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtClaims } from '@whatsapp-crm/shared-types';

/**
 * Extracts the authenticated user's JWT claims from the request.
 * Populated by JwtStrategy.validate() -> req.user.
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): JwtClaims => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
