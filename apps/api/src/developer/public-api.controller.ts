import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ListContactsQuerySchema,
  PublicSendMessageSchema,
  PublicUpsertContactSchema,
  type PublicSendMessage,
  type PublicUpsertContact,
} from '@whatsapp-crm/shared-types';
import { Public } from '../common/decorators/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ApiKeyContext, ApiKeyGuard, RequireScope } from './api-key.guard';
import { ApiLogInterceptor } from './api-log.interceptor';
import type { VerifiedKey } from './api-keys.service';
import { buildOpenApi } from './openapi';
import { PublicApiService } from './public-api.service';

/** The public API: authenticated with an API key instead of a login. Unversioned URL: /public/v1/... */
@Controller('public/v1')
@Public()
export class PublicApiController {
  constructor(private readonly api: PublicApiService) {}

  /** No key needed: the machine-readable description of this API. */
  @Get('openapi.json')
  openapi(@Req() req: Request) {
    const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() || req.protocol;
    const host = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim() || req.get('host');
    return buildOpenApi(`${proto}://${host}`);
  }

  @Get('templates')
  @UseGuards(ApiKeyGuard)
  @UseInterceptors(ApiLogInterceptor)
  @RequireScope('templates:read')
  templates(@ApiKeyContext() key: VerifiedKey) {
    return this.api.listTemplates(key.tenantId);
  }

  @Get('contacts')
  @UseGuards(ApiKeyGuard)
  @UseInterceptors(ApiLogInterceptor)
  @RequireScope('contacts:read')
  contacts(@ApiKeyContext() key: VerifiedKey, @Query(new ZodValidationPipe(ListContactsQuerySchema)) query: Parameters<PublicApiService['listContacts']>[1]) {
    return this.api.listContacts(key.tenantId, query);
  }

  @Post('contacts')
  @UseGuards(ApiKeyGuard)
  @UseInterceptors(ApiLogInterceptor)
  @RequireScope('contacts:write')
  async upsertContact(
    @ApiKeyContext() key: VerifiedKey,
    @Body(new ZodValidationPipe(PublicUpsertContactSchema)) body: PublicUpsertContact,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { contact, created } = await this.api.upsertContact(key.tenantId, body);
    res.status(created ? 201 : 200);
    return contact;
  }

  @Post('messages')
  @HttpCode(201)
  @UseGuards(ApiKeyGuard)
  @UseInterceptors(ApiLogInterceptor)
  @RequireScope('messages:send')
  sendMessage(@ApiKeyContext() key: VerifiedKey, @Body(new ZodValidationPipe(PublicSendMessageSchema)) body: PublicSendMessage) {
    return this.api.sendMessage(key.tenantId, body);
  }

  @Get('messages/:id')
  @UseGuards(ApiKeyGuard)
  @UseInterceptors(ApiLogInterceptor)
  @RequireScope('messages:read')
  getMessage(@ApiKeyContext() key: VerifiedKey, @Param('id', ParseUUIDPipe) id: string) {
    return this.api.getMessage(key.tenantId, id);
  }
}
