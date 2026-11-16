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

/** One parameter of a template component, in Cloud API wire format. */
export type TemplateParameter =
  | { type: 'text'; text: string }
  | { type: 'image'; image: { link: string } }
  | { type: 'video'; video: { link: string } }
  | { type: 'document'; document: { link: string } };

export interface TemplateComponent {
  type: 'header' | 'body';
  parameters: TemplateParameter[];
}

/** Template definition submitted to Meta for approval. */
export interface TemplateSubmission {
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY';
  headerType: 'none' | 'text' | 'image' | 'video' | 'document';
  headerText?: string | null;
  body: string;
  footer?: string | null;
  buttons: { type: 'quick_reply' | 'cta_url' | 'cta_phone'; label: string; value?: string }[];
}

/** A template as it exists on the WhatsApp Business Account. */
export interface RemoteTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string | null;
  headerType: TemplateSubmission['headerType'];
  headerText?: string | null;
  body: string;
  footer?: string | null;
  buttons: TemplateSubmission['buttons'];
}

/**
 * Thrown by providers when a send/management call fails. The campaign
 * dispatcher uses these flags to decide between retrying later (`transient`),
 * pausing the whole campaign (`authFailure` — e.g. an expired access token)
 * and marking just that recipient failed.
 */
export class WhatsAppSendError extends Error {
  constructor(
    message: string,
    public readonly code: string | undefined,
    public readonly httpStatus: number | undefined,
    public readonly transient: boolean,
    public readonly authFailure = false,
  ) {
    super(message);
    this.name = 'WhatsAppSendError';
  }
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
   * broadcast campaigns to fresh recipients). `components` carries the header
   * and body parameter values (empty for a template with no variables).
   */
  sendTemplateMessage(
    connection: WhatsappConnection,
    toWaId: string,
    templateName: string,
    languageCode: string,
    components: TemplateComponent[],
  ): Promise<{ waMessageId: string }>;

  /**
   * Verifies credentials before they are stored (and, for the real API,
   * subscribes the app to the WABA's webhooks). Throws WhatsAppSendError when
   * Meta rejects the token or ids.
   */
  connectAccount(credentials: {
    wabaId: string;
    phoneNumberId: string;
    accessToken: string;
  }): Promise<{ displayPhoneNumber: string | null; verifiedName: string | null }>;

  /** Submits a new template to Meta for review. */
  submitTemplate(
    connection: WhatsappConnection,
    template: TemplateSubmission,
  ): Promise<{ metaTemplateId: string; status: 'pending' | 'approved' }>;

  /** Lists every template on the connection's WhatsApp Business Account. */
  fetchTemplates(connection: WhatsappConnection): Promise<RemoteTemplate[]>;

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
