import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ResolvedTenantConnection {
  tenantId: string;
  connectionId: string;
}

/**
 * Resolves an inbound webhook event's `phoneNumberId` (Meta's routing key,
 * `value.metadata.phone_number_id` in the payload) back to the tenant that
 * owns that WhatsApp number. This is the multi-tenant fan-out point: Meta
 * sends all tenants' events to the same single webhook URL, and this is
 * what disambiguates them.
 */
@Injectable()
export class RouterService {
  private readonly logger = new Logger(RouterService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolveTenantByPhoneNumberId(phoneNumberId: string): Promise<ResolvedTenantConnection | null> {
    const connection = await this.prisma.whatsappConnection.findUnique({
      where: { phoneNumberId },
      select: { id: true, tenantId: true },
    });

    if (!connection) {
      // Deliberately visible logging rather than silent drop — an unmatched
      // phoneNumberId usually means a stale/misconfigured webhook
      // subscription or test data pointed at the wrong environment. No
      // dead-letter table in M2; this log line is the only trace.
      this.logger.warn(`No WhatsappConnection found for phoneNumberId="${phoneNumberId}"; dropping event`);
      return null;
    }

    return { tenantId: connection.tenantId, connectionId: connection.id };
  }
}
