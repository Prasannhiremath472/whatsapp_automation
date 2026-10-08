/**
 * Internal EventEmitter2 event names used to decouple InboxService (and the
 * webhook ingestion path) from InboxGateway (websockets module), so the
 * webhook module never has to import websockets machinery directly.
 *
 * Payloads:
 *   MESSAGE_NEW: { tenantId, message, conversation }
 *   CONVERSATION_UPDATED: { tenantId, conversation }
 */
export const INBOX_EVENTS = {
  MESSAGE_NEW: "inbox.message.new",
  CONVERSATION_UPDATED: "inbox.conversation.updated",
} as const;
