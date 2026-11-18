import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  CreateApiKeyRequestSchema,
  type ApiKeyDto,
  type ApiKeyWithSecretDto,
  type ApiLogSummaryDto,
  type ApiRequestLogDto,
  type CreateApiKeyRequest,
  type JwtClaims,
} from '@whatsapp-crm/shared-types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ApiKeysService } from './api-keys.service';
import { ApiLogsService } from './api-logs.service';

@Controller('api-keys')
@Roles('tenant_admin')
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  @Get()
  list(@TenantId() tenantId: string): Promise<ApiKeyDto[]> {
    return this.keys.list(tenantId);
  }

  @Post()
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtClaims,
    @Body(new ZodValidationPipe(CreateApiKeyRequestSchema)) body: CreateApiKeyRequest,
  ): Promise<ApiKeyWithSecretDto> {
    return this.keys.create(tenantId, user.sub, body);
  }

  /** Revoking is permanent: the key stops working at once and cannot be restored. */
  @Delete(':id')
  revoke(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string): Promise<ApiKeyDto> {
    return this.keys.revoke(tenantId, id);
  }
}

const LogQuerySchema = z.object({
  status: z.enum(['success', 'error']).optional(),
  apiKeyId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

@Controller('api-logs')
@Roles('tenant_admin')
export class ApiLogsController {
  constructor(private readonly logs: ApiLogsService) {}

  @Get('summary')
  summary(@TenantId() tenantId: string): Promise<ApiLogSummaryDto> {
    return this.logs.summary(tenantId);
  }

  @Get()
  list(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(LogQuerySchema)) query: z.infer<typeof LogQuerySchema>,
  ): Promise<{ items: ApiRequestLogDto[]; total: number; page: number; pageSize: number }> {
    return this.logs.list(tenantId, query);
  }
}
