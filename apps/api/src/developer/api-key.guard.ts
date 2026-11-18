import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { ApiScope } from '@whatsapp-crm/shared-types';
import { ApiKeysService, type VerifiedKey } from './api-keys.service';
import { ApiLogsService } from './api-logs.service';

export const API_SCOPE_KEY = 'apiScope';
/** The scope a public API route requires. */
export const RequireScope = (scope: ApiScope) => SetMetadata(API_SCOPE_KEY, scope);

/** The verified API key of the current public API request. */
export const ApiKeyContext = createParamDecorator((_data: unknown, ctx: ExecutionContext): VerifiedKey => ctx.switchToHttp().getRequest().apiKey);

export const RATE_LIMIT_PER_MINUTE = 120;

export function clientIp(req: Request): string | null {
  const forwarded = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  return forwarded || req.ip || null;
}

/**
 * Authenticates public API calls with `Authorization: Bearer gk_live_...` (or
 * `X-API-Key`), checks the route's scope and applies a per-key rate limit
 * (120 requests a minute, counted per API instance).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly keys: ApiKeysService,
    private readonly logs: ApiLogsService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { apiKey?: VerifiedKey; apiStartedAt?: number }>();
    req.apiStartedAt = Date.now();

    const header = req.headers.authorization;
    const secret = (header?.toLowerCase().startsWith('bearer ') ? header.slice(7) : (req.headers['x-api-key'] as string | undefined))?.trim();
    const key = secret ? await this.keys.verify(secret) : null;
    if (!key) throw new UnauthorizedException('Missing or invalid API key. Send it as "Authorization: Bearer gk_live_..."');

    const scope = this.reflector.get<ApiScope | undefined>(API_SCOPE_KEY, context.getHandler());
    if (scope && !key.scopes.includes(scope)) {
      this.logRejected(req, key, 403, `Missing scope ${scope}`);
      throw new HttpException(`This API key does not have the "${scope}" permission`, HttpStatus.FORBIDDEN);
    }

    const now = Date.now();
    const recent = (this.hits.get(key.id) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= RATE_LIMIT_PER_MINUTE) {
      this.logRejected(req, key, 429, 'Rate limit exceeded');
      const retryAfter = Math.max(1, Math.ceil((60_000 - (now - recent[0]!)) / 1000));
      const res = context.switchToHttp().getResponse();
      res.setHeader('Retry-After', String(retryAfter));
      throw new HttpException(`Rate limit exceeded: ${RATE_LIMIT_PER_MINUTE} requests per minute. Retry in ${retryAfter}s.`, HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.hits.set(key.id, recent);

    req.apiKey = key;
    this.keys.touch(key.id);
    return true;
  }

  private logRejected(req: Request & { apiStartedAt?: number }, key: VerifiedKey, status: number, error: string): void {
    this.logs.record({
      tenantId: key.tenantId,
      apiKeyId: key.id,
      method: req.method,
      path: req.path,
      status,
      durationMs: Date.now() - (req.apiStartedAt ?? Date.now()),
      ip: clientIp(req),
      error,
    });
  }
}
