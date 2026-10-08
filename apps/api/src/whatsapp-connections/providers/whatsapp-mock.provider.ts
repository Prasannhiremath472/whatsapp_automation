import { Injectable, Logger } from '@nestjs/common';
import type { WhatsappConnection } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { WhatsAppButton, WhatsAppListSection, WhatsAppProvider } from '../whatsapp-provider.interface';

/**
 * Default provider used in local dev / e2e tests (WHATSAPP_MODE=mock, the
 * default). Never makes a real network call — generates fake WhatsApp
 * message ids so the rest of the pipeline (status transitions, conversation
 * threading, etc.) can be exercised end-to-end without Meta credentials.
 */
@Injectable()
export class WhatsAppMockProvider implements WhatsAppProvider {
  private readonly logger = new Logger(WhatsAppMockProvider.name);

  async sendTextMessage(
    connection: WhatsappConnection,
    toWaId: string,
    text: string,
  ): Promise<{ waMessageId: string }> {
    const waMessageId = `mock-msg-${randomUUID()}`;
    this.logger.log(
      `[mock] sendTextMessage connection=${connection.id} to=${toWaId} text="${text}" -> ${waMessageId}`,
    );
    return { waMessageId };
  }

  async sendTemplateMessage(
    connection: WhatsappConnection,
    toWaId: string,
    templateName: string,
    languageCode: string,
    bodyParams: string[],
  ): Promise<{ waMessageId: string }> {
    const waMessageId = `mock-msg-${randomUUID()}`;
    this.logger.log(
      `[mock] sendTemplateMessage connection=${connection.id} to=${toWaId} template=${templateName} lang=${languageCode} params=${JSON.stringify(
        bodyParams,
      )} -> ${waMessageId}`,
    );
    return { waMessageId };
  }

  async sendListMessage(
    connection: WhatsappConnection,
    toWaId: string,
    params: { headerText?: string; bodyText: string; footerText?: string; buttonLabel: string; sections: WhatsAppListSection[] },
  ): Promise<{ waMessageId: string }> {
    const waMessageId = `mock-msg-${randomUUID()}`;
    this.logger.log(
      `[mock] sendListMessage connection=${connection.id} to=${toWaId} button="${params.buttonLabel}" body="${params.bodyText}" sections=${JSON.stringify(
        params.sections,
      )} -> ${waMessageId}`,
    );
    return { waMessageId };
  }

  async sendButtonMessage(
    connection: WhatsappConnection,
    toWaId: string,
    params: { bodyText: string; footerText?: string; buttons: WhatsAppButton[] },
  ): Promise<{ waMessageId: string }> {
    const waMessageId = `mock-msg-${randomUUID()}`;
    this.logger.log(
      `[mock] sendButtonMessage connection=${connection.id} to=${toWaId} body="${params.bodyText}" buttons=${JSON.stringify(
        params.buttons,
      )} -> ${waMessageId}`,
    );
    return { waMessageId };
  }

  verifyWebhookChallenge(
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
    expectedVerifyToken: string,
  ): string | null {
    if (mode === 'subscribe' && token === expectedVerifyToken && challenge) {
      return challenge;
    }
    return null;
  }
}
