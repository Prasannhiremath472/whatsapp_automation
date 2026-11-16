import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WhatsappConnection } from '@prisma/client';
import type {
  ConnectWhatsappAccountRequest,
  UpdateWhatsappAccountRequest,
  WhatsappAccountDto,
} from '@whatsapp-crm/shared-types';
import { encryptSecret } from '../common/crypto/secret-box';
import { PrismaService } from '../prisma/prisma.service';
import { WHATSAPP_PROVIDER, WhatsAppSendError, type WhatsAppProvider } from './whatsapp-provider.interface';

/** Never exposes the access token. */
export function toWhatsappAccountDto(c: WhatsappConnection): WhatsappAccountDto {
  return {
    id: c.id,
    wabaId: c.wabaId,
    phoneNumberId: c.phoneNumberId,
    displayPhoneNumber: c.displayPhoneNumber,
    status: c.connectionStatus,
    isMock: c.isMock,
    dailyMessageLimit: c.dailyMessageLimit,
    connectedAt: c.connectedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class WhatsappConnectionsService {
  private readonly logger = new Logger(WhatsappConnectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
  ) {}

  /**
   * Dev-only convenience: fabricates a WhatsappConnection for the caller's
   * own tenant so the webhook/router/inbox pipeline can be exercised without
   * real Meta credentials. tenantId is derived server-side from the JWT by
   * the controller — never accepted from the body.
   */
  async mockConnect(tenantId: string): Promise<WhatsappConnection> {
    if ((this.config.get<string>('WHATSAPP_MODE') ?? 'mock') === 'live') {
      throw new BadRequestException('Mock connections are only available when WHATSAPP_MODE=mock');
    }
    const existing = await this.prisma.whatsappConnection.findUnique({ where: { tenantId } });
    if (existing) {
      throw new ConflictException('This tenant already has a WhatsApp connection');
    }

    return this.prisma.whatsappConnection.create({
      data: {
        tenantId,
        phoneNumberId: `mock-${tenantId}`,
        displayPhoneNumber: '+1 555-0100',
        wabaId: `mock-waba-${tenantId}`,
        connectionStatus: 'connected',
        isMock: true,
        webhookVerifyToken: 'dev-webhook-verify-token',
        connectedAt: new Date(),
      },
    });
  }

  async findForTenant(tenantId: string): Promise<WhatsappConnection> {
    const connection = await this.prisma.whatsappConnection.findUnique({ where: { tenantId } });
    if (!connection) {
      throw new NotFoundException('No WhatsApp connection for this tenant');
    }
    return connection;
  }

  async listAccounts(tenantId: string): Promise<WhatsappAccountDto[]> {
    const connection = await this.prisma.whatsappConnection.findUnique({ where: { tenantId } });
    return connection ? [toWhatsappAccountDto(connection)] : [];
  }

  /**
   * Connects (or replaces) the tenant's WhatsApp Business number using Cloud
   * API credentials. The token is verified with Meta first (live mode) and is
   * stored AES-256-GCM encrypted; it is never returned by any endpoint.
   */
  async connect(tenantId: string, input: ConnectWhatsappAccountRequest): Promise<WhatsappAccountDto> {
    const encryptionKey = this.config.get<string>('ENCRYPTION_KEY');
    if (!encryptionKey) {
      this.logger.error('ENCRYPTION_KEY is not configured; refusing to store a WhatsApp access token');
      throw new InternalServerErrorException('The server is not configured to store WhatsApp credentials securely');
    }

    const owner = await this.prisma.whatsappConnection.findUnique({ where: { phoneNumberId: input.phoneNumberId } });
    if (owner && owner.tenantId !== tenantId) {
      throw new ConflictException('This phone number is already connected to another account');
    }

    let info: { displayPhoneNumber: string | null; verifiedName: string | null };
    try {
      info = await this.provider.connectAccount({
        wabaId: input.wabaId,
        phoneNumberId: input.phoneNumberId,
        accessToken: input.accessToken,
      });
    } catch (err) {
      if (err instanceof WhatsAppSendError) throw new BadRequestException(`WhatsApp rejected these credentials: ${err.message}`);
      throw err;
    }

    const isMock = (this.config.get<string>('WHATSAPP_MODE') ?? 'mock') !== 'live';
    const data = {
      wabaId: input.wabaId,
      phoneNumberId: input.phoneNumberId,
      displayPhoneNumber: info.displayPhoneNumber ?? input.displayPhoneNumber ?? null,
      accessTokenEncrypted: encryptSecret(input.accessToken, encryptionKey),
      connectionStatus: 'connected' as const,
      isMock,
      connectedAt: new Date(),
    };

    const saved = await this.prisma.whatsappConnection.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
    this.logger.log(`WhatsApp account connected tenantId=${tenantId} phoneNumberId=${input.phoneNumberId} mock=${isMock}`);
    return toWhatsappAccountDto(saved);
  }

  /** Marks the account disconnected and wipes the stored token. Running campaigns pause themselves. */
  async disconnect(tenantId: string): Promise<WhatsappAccountDto> {
    const connection = await this.findForTenant(tenantId);
    const updated = await this.prisma.whatsappConnection.update({
      where: { id: connection.id },
      data: { connectionStatus: 'disconnected', accessTokenEncrypted: null },
    });
    return toWhatsappAccountDto(updated);
  }

  async update(tenantId: string, input: UpdateWhatsappAccountRequest): Promise<WhatsappAccountDto> {
    const connection = await this.findForTenant(tenantId);
    const updated = await this.prisma.whatsappConnection.update({
      where: { id: connection.id },
      data: { ...(input.dailyMessageLimit !== undefined ? { dailyMessageLimit: input.dailyMessageLimit } : {}) },
    });
    return toWhatsappAccountDto(updated);
  }
}
