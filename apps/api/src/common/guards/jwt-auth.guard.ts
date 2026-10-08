import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Standard passport-jwt guard, applied globally in app.module.ts.
 *
 * Routes marked @Public() are allowed through without a valid token. When a
 * token IS present on a public route we still populate `request.user`, so
 * handlers like POST /auth/register can branch on "was this call made by an
 * authenticated super_admin?" (the dual-mode bootstrap-or-authenticated
 * registration flow) while unauthenticated calls (the bootstrap case) still
 * succeed.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  private isPublic(context: ExecutionContext): boolean {
    return !!this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isPublic(context)) {
      // Best-effort: populate request.user if a valid token is present,
      // but never block the request either way.
      try {
        await (super.canActivate(context) as Promise<boolean>);
      } catch {
        // no/invalid token on a public route is fine
      }
      return true;
    }

    return super.canActivate(context) as Promise<boolean>;
  }

  handleRequest<TUser = unknown>(
    err: unknown,
    user: unknown,
    _info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (this.isPublic(context)) {
      // Never throw on public routes; just pass through whatever passport found.
      return (user ?? null) as TUser;
    }
    if (err || !user) {
      throw err instanceof Error ? err : new UnauthorizedException();
    }
    return user as TUser;
  }
}
