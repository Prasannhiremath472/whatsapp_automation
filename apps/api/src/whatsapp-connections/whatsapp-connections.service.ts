import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { WhatsappConnection } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WhatsappConnectionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Dev-only convenience: fabricates a WhatsappConnection for the caller's
   * own tenant so the webhook/router/inbox pipeline can be exercised without
   * real Meta credentials. tenantId is derived server-side from the JWT by
   * the controller — never accepted from the body.
   */
  async mockConnect(tenantId: string): Promise<WhatsappConnection> {
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
}
