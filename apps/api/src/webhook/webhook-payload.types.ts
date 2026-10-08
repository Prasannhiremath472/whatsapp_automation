/**
 * Loosely-typed shapes for Meta's WhatsApp Cloud API webhook payloads.
 * Modeled on the documented structure:
 * https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
 *
 * Intentionally permissive (lots of optional/unknown fields) — we only rely
 * on the fields we actually consume in router/inbox processing. See
 * apps/api/test/fixtures/webhook-payloads/*.json for concrete examples.
 */

export interface WebhookContact {
  profile?: { name?: string };
  wa_id: string;
}

export interface WebhookInboundMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type?: string; sha256?: string; caption?: string };
  document?: { id: string; mime_type?: string; filename?: string; caption?: string };
  audio?: { id: string; mime_type?: string };
  video?: { id: string; mime_type?: string; caption?: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
}

export interface WebhookStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | string;
  timestamp: string;
  recipient_id: string;
  errors?: unknown[];
}

export interface WebhookChangeValue {
  messaging_product: 'whatsapp';
  metadata: {
    display_phone_number?: string;
    phone_number_id: string;
  };
  contacts?: WebhookContact[];
  messages?: WebhookInboundMessage[];
  statuses?: WebhookStatus[];
}

export interface WebhookChange {
  value: WebhookChangeValue;
  field: string;
}

export interface WebhookEntry {
  id: string;
  changes: WebhookChange[];
}

export interface WebhookPayload {
  object: string;
  entry: WebhookEntry[];
}
