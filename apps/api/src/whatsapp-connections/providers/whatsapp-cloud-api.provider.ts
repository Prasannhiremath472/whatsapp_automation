import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import type { WhatsappConnection } from '@prisma/client';
import { decryptSecret } from '../../common/crypto/secret-box';
import {
  WhatsAppSendError,
  type RemoteTemplate,
  type TemplateComponent,
  type TemplateSubmission,
  type WhatsAppButton,
  type WhatsAppListSection,
  type WhatsAppProvider,
} from '../whatsapp-provider.interface';
import { variableCount } from '@whatsapp-crm/shared-types';

/**
 * Real-mode provider (WHATSAPP_MODE=live) implemented against the actual
 * Meta WhatsApp Cloud API contract:
 * https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 *
 * This is structurally correct but CANNOT be live-tested in this environment
 * — no real phoneNumberId / access token credentials exist yet. It typechecks
 * and follows the documented request/response shapes; treat it as unverified
 * against the live API until credentials exist.
 */

/** Cloud API error codes that mean "try again later", not "this recipient is bad". */
const TRANSIENT_CODES = new Set([4, 80007, 130429, 131000, 131016, 131056, 133016]);
/** Codes meaning the access token / permissions are unusable for the whole account. */
const AUTH_CODES = new Set([10, 102, 190, 200]);

@Injectable()
export class WhatsAppCloudApiProvider implements WhatsAppProvider {
  private readonly logger = new Logger(WhatsAppCloudApiProvider.name);

  constructor(private readonly config: ConfigService) {}

  private get graphApiVersion(): string {
    return this.config.get<string>('META_GRAPH_API_VERSION') ?? 'v21.0';
  }

  private graphUrl(path: string): string {
    return `https://graph.facebook.com/${this.graphApiVersion}/${path}`;
  }

  private accessTokenFor(connection: WhatsappConnection): string {
    if (!connection.accessTokenEncrypted) {
      throw new WhatsAppSendError(
        'No WhatsApp access token is configured for this account',
        undefined,
        undefined,
        false,
        true,
      );
    }
    try {
      return decryptSecret(connection.accessTokenEncrypted, this.config.get<string>('ENCRYPTION_KEY'));
    } catch (err) {
      this.logger.error(`Could not decrypt access token for connection ${connection.id}: ${(err as Error).message}`);
      throw new WhatsAppSendError('Stored WhatsApp access token could not be decrypted', undefined, undefined, false, true);
    }
  }

  /** Converts any axios/Graph failure into a WhatsAppSendError. */
  private toSendError(err: unknown): WhatsAppSendError {
    if (err instanceof WhatsAppSendError) return err;
    if (axios.isAxiosError(err)) {
      const ax = err as AxiosError<{ error?: { message?: string; code?: number; error_user_msg?: string; error_data?: { details?: string } } }>;
      const status = ax.response?.status;
      const apiErr = ax.response?.data?.error;
      const code = apiErr?.code;
      const message =
        apiErr?.error_user_msg ?? apiErr?.error_data?.details ?? apiErr?.message ?? ax.message ?? 'WhatsApp request failed';
      const authFailure = status === 401 || (code !== undefined && AUTH_CODES.has(code));
      const transient =
        !authFailure &&
        (!ax.response || status === 429 || (status !== undefined && status >= 500) || (code !== undefined && TRANSIENT_CODES.has(code)));
      return new WhatsAppSendError(message, code !== undefined ? String(code) : undefined, status, transient, authFailure);
    }
    return new WhatsAppSendError(err instanceof Error ? err.message : String(err), undefined, undefined, false);
  }

  private async post<T = Record<string, any>>(connection: WhatsappConnection, url: string, body: unknown): Promise<T> {
    try {
      const response = await axios.post<T>(url, body, {
        headers: { Authorization: `Bearer ${this.accessTokenFor(connection)}`, 'Content-Type': 'application/json' },
        timeout: 20_000,
      });
      return response.data;
    } catch (err) {
      throw this.toSendError(err);
    }
  }

  private async postMessage(connection: WhatsappConnection, body: Record<string, unknown>): Promise<{ waMessageId: string }> {
    const data = await this.post<{ messages?: { id?: string }[] }>(
      connection,
      this.graphUrl(`${connection.phoneNumberId}/messages`),
      { messaging_product: 'whatsapp', recipient_type: 'individual', ...body },
    );
    const waMessageId = data?.messages?.[0]?.id;
    if (!waMessageId) {
      this.logger.error(`Cloud API response missing message id: ${JSON.stringify(data)}`);
      throw new WhatsAppSendError('WhatsApp Cloud API did not return a message id', undefined, undefined, false);
    }
    return { waMessageId };
  }

  sendTextMessage(connection: WhatsappConnection, toWaId: string, text: string) {
    return this.postMessage(connection, { to: toWaId, type: 'text', text: { preview_url: false, body: text } });
  }

  sendTemplateMessage(
    connection: WhatsappConnection,
    toWaId: string,
    templateName: string,
    languageCode: string,
    components: TemplateComponent[],
  ) {
    return this.postMessage(connection, {
      to: toWaId,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length > 0 ? { components } : {}),
      },
    });
  }

  async connectAccount(credentials: {
    wabaId: string;
    phoneNumberId: string;
    accessToken: string;
  }): Promise<{ displayPhoneNumber: string | null; verifiedName: string | null }> {
    const headers = { Authorization: `Bearer ${credentials.accessToken}` };
    try {
      const info = await axios.get<{ display_phone_number?: string; verified_name?: string }>(
        this.graphUrl(credentials.phoneNumberId) + "?fields=display_phone_number,verified_name",
        { headers, timeout: 20_000 },
      );
      // Without this subscription Meta never sends delivery receipts or replies for the WABA.
      await axios.post(this.graphUrl(`${credentials.wabaId}/subscribed_apps`), {}, { headers, timeout: 20_000 });
      return {
        displayPhoneNumber: info.data.display_phone_number ?? null,
        verifiedName: info.data.verified_name ?? null,
      };
    } catch (err) {
      throw this.toSendError(err);
    }
  }

  async submitTemplate(connection: WhatsappConnection, t: TemplateSubmission) {
    if (!connection.wabaId) {
      throw new WhatsAppSendError('This WhatsApp account has no WABA id configured', undefined, undefined, false);
    }
    if (t.headerType === 'image' || t.headerType === 'video' || t.headerType === 'document') {
      throw new WhatsAppSendError(
        'Templates with an image, video or document header must be created in WhatsApp Manager (Meta requires an uploaded sample). Create it there, then use "Sync from Meta".',
        undefined,
        undefined,
        false,
      );
    }

    const components: Record<string, unknown>[] = [];
    if (t.headerType === 'text' && t.headerText) {
      components.push({
        type: 'HEADER',
        format: 'TEXT',
        text: t.headerText,
        ...(variableCount(t.headerText) > 0 ? { example: { header_text: ['Sample'] } } : {}),
      });
    }
    const bodyVars = variableCount(t.body);
    components.push({
      type: 'BODY',
      text: t.body,
      ...(bodyVars > 0 ? { example: { body_text: [Array.from({ length: bodyVars }, (_, i) => `Sample ${i + 1}`)] } } : {}),
    });
    if (t.footer) components.push({ type: 'FOOTER', text: t.footer });
    if (t.buttons.length > 0) {
      components.push({
        type: 'BUTTONS',
        buttons: t.buttons.map((b) =>
          b.type === 'quick_reply'
            ? { type: 'QUICK_REPLY', text: b.label }
            : b.type === 'cta_url'
              ? { type: 'URL', text: b.label, url: b.value }
              : { type: 'PHONE_NUMBER', text: b.label, phone_number: b.value },
        ),
      });
    }

    const data = await this.post<{ id?: string; status?: string }>(
      connection,
      this.graphUrl(`${connection.wabaId}/message_templates`),
      { name: t.name, language: t.language, category: t.category, components },
    );
    if (!data?.id) throw new WhatsAppSendError('Meta did not return a template id', undefined, undefined, false);
    return { metaTemplateId: data.id, status: data.status === 'APPROVED' ? ('approved' as const) : ('pending' as const) };
  }

  async fetchTemplates(connection: WhatsappConnection): Promise<RemoteTemplate[]> {
    if (!connection.wabaId) {
      throw new WhatsAppSendError('This WhatsApp account has no WABA id configured', undefined, undefined, false);
    }
    const out: RemoteTemplate[] = [];
    let url: string | undefined =
      this.graphUrl(`${connection.wabaId}/message_templates`) +
      '?fields=id,name,language,status,category,components,rejected_reason&limit=100';

    try {
      while (url) {
        const res: { data: { data?: any[]; paging?: { next?: string } } } = await axios.get(url, {
          headers: { Authorization: `Bearer ${this.accessTokenFor(connection)}` },
          timeout: 20_000,
        });
        for (const t of res.data.data ?? []) {
          if (t.category === 'AUTHENTICATION') continue; // not supported by the campaign flow
          const comps: any[] = t.components ?? [];
          const header = comps.find((c) => c.type === 'HEADER');
          const body = comps.find((c) => c.type === 'BODY');
          const footer = comps.find((c) => c.type === 'FOOTER');
          const buttons = comps.find((c) => c.type === 'BUTTONS')?.buttons ?? [];
          if (!body?.text) continue;
          out.push({
            id: String(t.id),
            name: t.name,
            language: t.language,
            category: t.category,
            status: t.status === 'APPROVED' ? 'approved' : t.status === 'PENDING' ? 'pending' : 'rejected',
            rejectionReason: t.status === 'REJECTED' ? (t.rejected_reason ?? null) : t.status === 'APPROVED' || t.status === 'PENDING' ? null : `Status: ${t.status}`,
            headerType: header ? (String(header.format).toLowerCase() as RemoteTemplate['headerType']) : 'none',
            headerText: header?.format === 'TEXT' ? header.text : null,
            body: body.text,
            footer: footer?.text ?? null,
            buttons: buttons
              .map((b: any) =>
                b.type === 'QUICK_REPLY'
                  ? { type: 'quick_reply' as const, label: b.text }
                  : b.type === 'URL'
                    ? { type: 'cta_url' as const, label: b.text, value: b.url }
                    : b.type === 'PHONE_NUMBER'
                      ? { type: 'cta_phone' as const, label: b.text, value: b.phone_number }
                      : null,
              )
              .filter(Boolean),
          });
        }
        url = res.data.paging?.next;
      }
    } catch (err) {
      throw this.toSendError(err);
    }
    return out;
  }

  sendListMessage(
    connection: WhatsappConnection,
    toWaId: string,
    params: { headerText?: string; bodyText: string; footerText?: string; buttonLabel: string; sections: WhatsAppListSection[] },
  ) {
    return this.postMessage(connection, {
      to: toWaId,
      type: 'interactive',
      interactive: {
        type: 'list',
        ...(params.headerText ? { header: { type: 'text', text: params.headerText } } : {}),
        body: { text: params.bodyText },
        ...(params.footerText ? { footer: { text: params.footerText } } : {}),
        action: { button: params.buttonLabel, sections: params.sections },
      },
    });
  }

  sendButtonMessage(
    connection: WhatsappConnection,
    toWaId: string,
    params: { bodyText: string; footerText?: string; buttons: WhatsAppButton[] },
  ) {
    return this.postMessage(connection, {
      to: toWaId,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: params.bodyText },
        ...(params.footerText ? { footer: { text: params.footerText } } : {}),
        action: { buttons: params.buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title } })) },
      },
    });
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
