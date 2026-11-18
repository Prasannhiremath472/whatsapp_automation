import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, WebhookEndpoint } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import type {
  SaveWebhookEndpointRequest,
  WebhookDeliveryDto,
  WebhookEndpointDto,
  WebhookEndpointWithSecretDto,
  WebhookEventName,
} from '@whatsapp-crm/shared-types';
import { encryptSecret } from '../common/crypto/secret-box';
import { PrismaService } from '../prisma/prisma.service';
import { assertSafeWebhookUrl } from './safe-url';

export function toEndpointDto(e: WebhookEndpoint): WebhookEndpointDto {
  return {
    id: e.id,
    name: e.name,
    url: e.url,
    events: e.events as unknown as WebhookEventName[],
    active: e.active,
    lastDeliveryAt: e.lastDeliveryAt?.toISOString() ?? null,
    lastStatus: e.lastStatus,
    createdAt: e.createdAt.toISOString(),
  };
}

const newSecret = () => `whsec_${randomBytes(24).toString('hex')}`;

@Injectable()
export class WebhookEndpointsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async list(tenantId: string): Promise<WebhookEndpointDto[]> {
    const rows = await this.prisma.webhookEndpoint.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
    return rows.map(toEndpointDto);
  }

  private async findOwned(tenantId: string, id: string): Promise<WebhookEndpoint> {
    const row = await this.prisma.webhookEndpoint.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Webhook not found');
    return row;
  }

  private async checkUrl(url: string): Promise<void> {
    try {
      await assertSafeWebhookUrl(url);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  /** The signing secret is shown once, here, and never returned again. */
  async create(tenantId: string, input: SaveWebhookEndpointRequest): Promise<WebhookEndpointWithSecretDto> {
    const count = await this.prisma.webhookEndpoint.count({ where: { tenantId } });
    if (count >= 10) throw new BadRequestException('You can have at most 10 webhooks');
    await this.checkUrl(input.url);
    const secret = newSecret();
    const created = await this.prisma.webhookEndpoint.create({
      data: {
        tenantId,
        name: input.name,
        url: input.url,
        events: input.events as unknown as Prisma.InputJsonValue,
        active: input.active,
        secretCipher: encryptSecret(secret, this.config.get<string>('ENCRYPTION_KEY')),
      },
    });
    return { ...toEndpointDto(created), secret };
  }

  async update(tenantId: string, id: string, input: SaveWebhookEndpointRequest): Promise<WebhookEndpointDto> {
    await this.findOwned(tenantId, id);
    await this.checkUrl(input.url);
    const updated = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: {
        name: input.name,
        url: input.url,
        events: input.events as unknown as Prisma.InputJsonValue,
        active: input.active,
        ...(input.active ? { consecutiveFails: 0 } : {}),
      },
    });
    return toEndpointDto(updated);
  }

  async rotateSecret(tenantId: string, id: string): Promise<WebhookEndpointWithSecretDto> {
    await this.findOwned(tenantId, id);
    const secret = newSecret();
    const updated = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: { secretCipher: encryptSecret(secret, this.config.get<string>('ENCRYPTION_KEY')) },
    });
    return { ...toEndpointDto(updated), secret };
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.findOwned(tenantId, id);
    await this.prisma.webhookEndpoint.delete({ where: { id } });
  }

  async deliveries(tenantId: string, id: string): Promise<WebhookDeliveryDto[]> {
    await this.findOwned(tenantId, id);
    const rows = await this.prisma.webhookDelivery.findMany({ where: { endpointId: id, tenantId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return rows.map((d) => ({
      id: d.id,
      event: d.event,
      status: d.status,
      attempts: d.attempts,
      responseStatus: d.responseStatus,
      error: d.error,
      createdAt: d.createdAt.toISOString(),
      lastAttemptAt: d.lastAttemptAt?.toISOString() ?? null,
    }));
  }

  /** Queues a sample event so the owner can check their receiver. */
  async sendTest(tenantId: string, id: string): Promise<void> {
    const endpoint = await this.findOwned(tenantId, id);
    await this.prisma.webhookDelivery.create({
      data: {
        endpointId: endpoint.id,
        tenantId,
        event: 'ping',
        payload: { event: 'ping', createdAt: new Date().toISOString(), data: { message: 'This is a test event from Genie.' } },
      },
    });
  }
}
