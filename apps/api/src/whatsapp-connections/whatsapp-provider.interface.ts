import type { WhatsappConnection } from '@prisma/client';

export interface WhatsAppListSection {
  title?: string;
  rows: { id: string; title: string; description?: string }[];
}

export interface WhatsAppButton {
  id: string;
  /** WhatsApp caps reply button titles at 20 characters. */
  title: string;
}

/**
 * Structural interface every WhatsApp send-side provider implements —
 * whether it's the mock (no real network call, used in local dev / e2e
 * tests) or the real Meta Cloud API. Selected at runtime by WHATSAPP_MODE
 * via whatsapp-provider.module.ts / the WHATSAPP_PROVIDER injection token.
 */
export interface WhatsAppProvider {
  /**
   * Sends a free-form text message to `toWaId` using the given connection's
   * credentials. Returns the provider-assigned message id.
   */
  sendTextMessage(
    connection: WhatsappConnection,
    toWaId: string,
    text: string,
  ): Promise<{ waMessageId: string }>;

  /**
   * Sends a pre-approved WhatsApp Message Template — required for
   * first-contact / outside-the-24h-session-window sends (e.g. bulk
   * broadcast campaigns to fresh recipients). bodyParams fills the
   * template's positional {{1}}, {{2}}... placeholders in order; pass an
   * empty array for a template with no variables.
   */
  sendTemplateMessage(
    connection: WhatsappConnection,
    toWaId: string,
    templateName: string,
    languageCode: string,
    bodyParams: string[],
  ): Promise<{ waMessageId: string }>;

  /** Sends a WhatsApp interactive List Message (up to 10 rows across sections). */
  sendListMessage(
    connection: WhatsappConnection,
    toWaId: string,
    params: {
      headerText?: string;
      bodyText: string;
      footerText?: string;
      buttonLabel: string;
      sections: WhatsAppListSection[];
    },
  ): Promise<{ waMessageId: string }>;

  /** Sends a WhatsApp interactive Reply Buttons message (max 3 buttons). */
  sendButtonMessage(
    connection: WhatsappConnection,
    toWaId: string,
    params: { bodyText: string; footerText?: string; buttons: WhatsAppButton[] },
  ): Promise<{ waMessageId: string }>;

  /**
   * Implements Meta's webhook verification handshake logic: if `mode` is
   * "subscribe" and `token` matches `expectedVerifyToken`, returns
   * `challenge` (to be echoed back verbatim); otherwise returns null.
   */
  verifyWebhookChallenge(
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
    expectedVerifyToken: string,
  ): string | null;
}

export const WHATSAPP_PROVIDER = 'WHATSAPP_PROVIDER';
