import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { Request, Response } from 'express';
import { Inject } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { WEBHOOK_EVENTS_QUEUE } from './webhook-queue.constants';
import type { WebhookPayload } from './webhook-payload.types';
import { verifyMetaSignature } from './webhook-signature';
import { WHATSAPP_PROVIDER, type WhatsAppProvider } from '../whatsapp-connections/whatsapp-provider.interface';

/**
 * Meta's WhatsApp webhook is ONE app-level URL shared across ALL tenants —
 * there is no per-tenant webhook URL. Meta subscribes to this single
 * endpoint when the app is configured in the Meta Developer console, and
 * every tenant's events arrive here; per-tenant routing happens downstream
 * (see RouterService.resolveTenantByPhoneNumberId, keyed off
 * `value.metadata.phone_number_id` in the payload).
 *
 * Consequently the GET /webhook verification handshake also uses ONE
 * platform-level verify token (META_WEBHOOK_VERIFY_TOKEN env var), not a
 * per-tenant WhatsappConnection.webhookVerifyToken — that field exists on
 * the model for future per-connection bookkeeping/display but is not what
 * Meta's handshake checks against, because the handshake happens before any
 * tenant is known.
 */
@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly config: ConfigService,
    @InjectQueue(WEBHOOK_EVENTS_QUEUE) private readonly queue: Queue,
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
  ) {}

  @Public()
  @Get()
  verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() res: Response,
  ): void {
    const expected = this.config.get<string>('META_WEBHOOK_VERIFY_TOKEN') ?? '';
    const result = this.provider.verifyWebhookChallenge(mode, token, challenge, expected);

    if (result === null) {
      res.status(403).send('Forbidden');
      return;
    }

    res.status(200).send(result);
  }

  @Public()
  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() body: unknown,
  ): Promise<{ received: true }> {
    // In live mode every delivery must be signed by Meta with the app secret.
    // (Mock/dev mode has no Meta app, so unsigned posts are accepted there only.)
    if ((this.config.get<string>('WHATSAPP_MODE') ?? 'mock') === 'live') {
      const secret = this.config.get<string>('META_APP_SECRET') ?? '';
      if (!verifyMetaSignature(req.rawBody, signature, secret)) {
        this.logger.warn('Rejected webhook POST with a missing or invalid X-Hub-Signature-256');
        throw new UnauthorizedException('Invalid webhook signature');
      }
    }

    const payload = body as Partial<WebhookPayload>;
    if (!payload || payload.object !== 'whatsapp_business_account') {
      throw new BadRequestException('Unexpected webhook payload shape');
    }

    await this.queue.add('inbound-webhook-event', payload, {
      removeOnComplete: true,
      removeOnFail: 100,
    });

    return { received: true };
  }
}
