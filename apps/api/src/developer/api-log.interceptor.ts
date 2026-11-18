import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { clientIp } from './api-key.guard';
import { ApiLogsService } from './api-logs.service';
import type { VerifiedKey } from './api-keys.service';

/** Writes one row per public API call (no request or response bodies are stored). */
@Injectable()
export class ApiLogInterceptor implements NestInterceptor {
  constructor(private readonly logs: ApiLogsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { apiKey?: VerifiedKey; apiStartedAt?: number }>();
    const startedAt = req.apiStartedAt ?? Date.now();
    const write = (status: number, error?: string) => {
      if (!req.apiKey) return;
      this.logs.record({
        tenantId: req.apiKey.tenantId,
        apiKeyId: req.apiKey.id,
        method: req.method,
        path: req.path,
        status,
        durationMs: Date.now() - startedAt,
        ip: clientIp(req),
        ...(error ? { error } : {}),
      });
    };

    return next.handle().pipe(
      tap(() => write(http.getResponse().statusCode)),
      catchError((err: unknown) => {
        const status = err instanceof HttpException ? err.getStatus() : 500;
        write(status, err instanceof Error ? err.message : 'Error');
        return throwError(() => err);
      }),
    );
  }
}
