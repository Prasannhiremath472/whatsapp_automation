import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type { WhatsappConnection } from '@prisma/client';
import type { WhatsAppButton, WhatsAppListSection, WhatsAppProvider } from '../whatsapp-provider.interface';

/**
 * Real-mode provider (WHATSAPP_MODE=live) implemented against the actual
 * Meta WhatsApp Cloud API contract:
 * https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 *
 * This is structurally correct but CANNOT be live-tested in this environment
 * — the user has not completed Meta business verification yet, so there are
 * no real phoneNumberId / access token credentials to exercise it against.
 * It typechecks and follows the documented request/response shapes; treat it
 * as unverified against the live API until credentials exist.
 */
@Injectable()
export class WhatsAppCloudApiProvider implements WhatsAppProvider {
  private readonly logger = new Logger(WhatsAppCloudApiProvider.name);

  constructor(private readonly config: ConfigService) {}

  private get graphApiVersion(): string {
    return this.config.get<string>('META_GRAPH_API_VERSION') ?? 'v21.0';
  }

  private graphUrl(phoneNumberId: string): string {
    return `https://graph.facebook.com/${this.graphApiVersion}/${phoneNumberId}/messages`;
  }

  private accessTokenFor(connection: WhatsappConnection): string {
    // In live mode, connection.accessTokenEncrypted holds an encrypted
    // long-lived token (decryption is out of scope for M2 — the encryption
    // scheme lands with the real embedded-signup flow in a later
    // milestone). For now this is a structural placeholder.
    if (!connection.accessTokenEncrypted) {
      throw new Error(
        `WhatsappConnection ${connection.id} has no access token configured; cannot send via live Cloud API provider`,
      );
    }
    return connection.accessTokenEncrypted;
  }

  async sendTextMessage(
    connection: WhatsappConnection,
    toWaId: string,
    text: string,
  ): Promise<{ waMessageId: string }> {
    const url = this.graphUrl(connection.phoneNumberId);
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toWaId,
      type: 'text',
      text: { preview_url: false, body: text },
    };

    const response = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${this.accessTokenFor(connection)}`,
        'Content-Type': 'application/json',
      },
    });

    const waMessageId = response.data?.messages?.[0]?.id;
    if (!waMessageId) {
      this.logger.error(`Cloud API response missing message id: ${JSON.stringify(response.data)}`);
      throw new Error('WhatsApp Cloud API did not return a message id');
    }
    return { waMessageId };
  }

  async sendTemplateMessage(
    connection: WhatsappConnection,
    toWaId: string,
    templateName: string,
    languageCode: string,
    bodyParams: string[],
  ): Promise<{ waMessageId: string }> {
    const url = this.graphUrl(connection.phoneNumberId);
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toWaId,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(bodyParams.length > 0
          ? { components: [{ type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text })) }] }
          : {}),
      },
    };

    const response = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${this.accessTokenFor(connection)}`,
        'Content-Type': 'application/json',
      },
    });

    const waMessageId = response.data?.messages?.[0]?.id;
    if (!waMessageId) {
      this.logger.error(`Cloud API response missing message id: ${JSON.stringify(response.data)}`);
      throw new Error('WhatsApp Cloud API did not return a message id');
    }
    return { waMessageId };
  }

  async sendListMessage(
    connection: WhatsappConnection,
    toWaId: string,
    params: { headerText?: string; bodyText: string; footerText?: string; buttonLabel: string; sections: WhatsAppListSection[] },
  ): Promise<{ waMessageId: string }> {
    const url = this.graphUrl(connection.phoneNumberId);
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toWaId,
      type: 'interactive',
      interactive: {
        type: 'list',
        ...(params.headerText ? { header: { type: 'text', text: params.headerText } } : {}),
        body: { text: params.bodyText },
        ...(params.footerText ? { footer: { text: params.footerText } } : {}),
        action: { button: params.buttonLabel, sections: params.sections },
      },
    };

    const response = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${this.accessTokenFor(connection)}`,
        'Content-Type': 'application/json',
      },
    });

    const waMessageId = response.data?.messages?.[0]?.id;
    if (!waMessageId) {
      this.logger.error(`Cloud API response missing message id: ${JSON.stringify(response.data)}`);
      throw new Error('WhatsApp Cloud API did not return a message id');
    }
    return { waMessageId };
  }

  async sendButtonMessage(
    connection: WhatsappConnection,
    toWaId: string,
    params: { bodyText: string; footerText?: string; buttons: WhatsAppButton[] },
  ): Promise<{ waMessageId: string }> {
    const url = this.graphUrl(connection.phoneNumberId);
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toWaId,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: params.bodyText },
        ...(params.footerText ? { footer: { text: params.footerText } } : {}),
        action: {
          buttons: params.buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title } })),
        },
      },
    };

    const response = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${this.accessTokenFor(connection)}`,
        'Content-Type': 'application/json',
      },
    });

    const waMessageId = response.data?.messages?.[0]?.id;
    if (!waMessageId) {
      this.logger.error(`Cloud API response missing message id: ${JSON.stringify(response.data)}`);
      throw new Error('WhatsApp Cloud API did not return a message id');
    }
    return { waMessageId };
  }

  verifyWebhookChallenge(
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
    expectedVerifyToken: string,
  ): string | null {
    // Same handshake logic as mock — Meta's verification contract doesn't
    // differ between mock/live, only the message-send transport does.
    if (mode === 'subscribe' && token === expectedVerifyToken && challenge) {
      return challenge;
    }
    return null;
  }
}
