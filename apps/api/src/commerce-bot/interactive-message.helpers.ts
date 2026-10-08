import type { Message } from '@prisma/client';

const START_TRIGGERS = /^(hi|hello|hey|buy machine|order machine)$/i;

/** True if the customer's free text should (re)enter the main menu, regardless of current step. */
export function isStartTrigger(text: string): boolean {
  return START_TRIGGERS.test(text.trim());
}

/**
 * Reads the row/button id from an inbound interactive reply
 * (interactive_list / interactive_button), or null if this message isn't an
 * interactive reply.
 */
export function extractReplyId(message: Message): string | null {
  const content = message.content as { id?: unknown } | null;
  if (message.messageType === 'interactive_list' || message.messageType === 'interactive_button') {
    return typeof content?.id === 'string' ? content.id : null;
  }
  return null;
}

/** Reads free-form text from an inbound text message, or '' otherwise. */
export function extractText(message: Message): string {
  const content = message.content as { body?: unknown } | null;
  return typeof content?.body === 'string' ? content.body : '';
}

/** Parses a `config:<groupId>:<optionId>` row id. */
export function parseConfigRowId(id: string): { groupId: string; optionId: string } | null {
  const match = /^config:([^:]+):([^:]+)$/.exec(id);
  if (!match) return null;
  return { groupId: match[1], optionId: match[2] };
}

/** Parses a `<prefix>:<id>` row/button id, e.g. `category:uuid` -> { prefix: 'category', id: 'uuid' }. */
export function parsePrefixedId(id: string): { prefix: string; id: string } | null {
  const idx = id.indexOf(':');
  if (idx === -1) return null;
  return { prefix: id.slice(0, idx), id: id.slice(idx + 1) };
}
