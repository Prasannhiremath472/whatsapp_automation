import { Injectable, Logger } from '@nestjs/common';
import type { WhatsappConnection } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  WhatsAppSendError,
  type RemoteTemplate,
  type TemplateComponent,
  type TemplateSubmission,
  type WhatsAppButton,
  type WhatsAppListSection,
  type WhatsAppProvider,
} from '../whatsapp-provider.interface';

/**
 * Recipients whose number ends in this suffix always fail with a permanent
 * "not on WhatsApp" error, so the failure path of a campaign can be exercised
 * locally without real Meta credentials.
 */
export const MOCK_FAIL_SUFFIX = '0000';

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
    components: TemplateComponent[],
  ): Promise<{ waMessageId: string }> {
    if (toWaId.endsWith(MOCK_FAIL_SUFFIX)) {
      throw new WhatsAppSendError('Recipient phone number is not a WhatsApp number (mock)', '131026', 400, false);
    }
    const waMessageId = `mock-msg-${randomUUID()}`;
    this.logger.debug(
      `[mock] sendTemplateMessage connection=${connection.id} to=${toWaId} template=${templateName} lang=${languageCode} components=${JSON.stringify(
        components,
      )} -> ${waMessageId}`,
    );
    return { waMessageId };
  }

  async connectAccount(credentials: {
    wabaId: string;
    phoneNumberId: string;
    accessToken: string;
  }): Promise<{ displayPhoneNumber: string | null; verifiedName: string | null }> {
    this.logger.log(`[mock] connectAccount phoneNumberId=${credentials.phoneNumberId}`);
    return { displayPhoneNumber: null, verifiedName: null };
  }

  async submitTemplate(
    connection: WhatsappConnection,
    template: TemplateSubmission,
  ): Promise<{ metaTemplateId: string; status: 'pending' | 'approved' }> {
    // No reviewer in mock mode: templates are approved immediately.
    this.logger.log(`[mock] submitTemplate connection=${connection.id} name=${template.name} -> approved`);
    return { metaTemplateId: `mock-tpl-${randomUUID()}`, status: 'approved' };
  }

  async fetchTemplates(): Promise<RemoteTemplate[]> {
    return [];
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
