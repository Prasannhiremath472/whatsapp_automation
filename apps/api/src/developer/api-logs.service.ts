import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { ApiLogSummaryDto, ApiRequestLogDto } from '@whatsapp-crm/shared-types';
import { PrismaService } from '../prisma/prisma.service';

const KEEP_DAYS = 30;

export interface LogEntry {
  tenantId: string;
  apiKeyId: string | null;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  ip: string | null;
  error?: string | null;
}

@Injectable()
export class ApiLogsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ApiLogsService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    // Once a day delete logs older than the retention period.
    this.timer = setInterval(() => void this.cleanup(), 24 * 3_600_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async cleanup(): Promise<void> {
    try {
      await this.prisma.apiRequestLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - KEEP_DAYS * 86_400_000) } } });
    } catch (err) {
      this.logger.warn(`Could not clean old API logs: ${(err as Error).message}`);
    }
  }

  /** Never throws: logging must not break an API call. */
  record(entry: LogEntry): void {
    void this.prisma.apiRequestLog
      .create({
        data: {
          tenantId: entry.tenantId,
          apiKeyId: entry.apiKeyId,
          method: entry.method.slice(0, 10),
          path: entry.path.slice(0, 200),
          status: entry.status,
          durationMs: Math.max(0, Math.round(entry.durationMs)),
          ip: entry.ip?.slice(0, 64) ?? null,
          error: entry.error ? entry.error.slice(0, 300) : null,
        },
      })
      .catch((err: Error) => this.logger.warn(`Could not write an API log: ${err.message}`));
  }

  async list(
    tenantId: string,
    filter: { status?: 'success' | 'error'; apiKeyId?: string; page: number; pageSize: number },
  ): Promise<{ items: ApiRequestLogDto[]; total: number; page: number; pageSize: number }> {
    const where = {
      tenantId,
      ...(filter.apiKeyId ? { apiKeyId: filter.apiKeyId } : {}),
      ...(filter.status === 'success' ? { status: { lt: 400 } } : filter.status === 'error' ? { status: { gte: 400 } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.apiRequestLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (filter.page - 1) * filter.pageSize, take: filter.pageSize }),
      this.prisma.apiRequestLog.count({ where }),
    ]);
    const keys = await this.prisma.apiKey.findMany({ where: { tenantId, id: { in: rows.map((r) => r.apiKeyId).filter((v): v is string => !!v) } }, select: { id: true, name: true } });
    const names = new Map(keys.map((k) => [k.id, k.name]));
    return {
      items: rows.map((r) => ({
        id: r.id,
        apiKeyId: r.apiKeyId,
        apiKeyName: r.apiKeyId ? (names.get(r.apiKeyId) ?? null) : null,
        method: r.method,
        path: r.path,
        status: r.status,
        durationMs: r.durationMs,
        ip: r.ip,
        error: r.error,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }

  async summary(tenantId: string): Promise<ApiLogSummaryDto> {
    const since = new Date(Date.now() - 24 * 3_600_000);
    const [requests, errors, avg] = await Promise.all([
      this.prisma.apiRequestLog.count({ where: { tenantId, createdAt: { gte: since } } }),
      this.prisma.apiRequestLog.count({ where: { tenantId, createdAt: { gte: since }, status: { gte: 400 } } }),
      this.prisma.apiRequestLog.aggregate({ where: { tenantId, createdAt: { gte: since } }, _avg: { durationMs: true } }),
    ]);
    return { requests, errors, avgDurationMs: Math.round(avg._avg.durationMs ?? 0) };
  }
}
