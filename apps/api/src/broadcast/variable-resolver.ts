import type { MessageTemplate } from '@prisma/client';
import { fillVariables, variableCount, type VariableMapping, type VariableSource } from '@whatsapp-crm/shared-types';
import type { TemplateComponent, TemplateParameter } from '../whatsapp-connections/whatsapp-provider.interface';

export interface ContactForVariables {
  waId: string;
  displayName: string | null;
  profileName: string | null;
  email: string | null;
  location: string | null;
}

/** WhatsApp rejects template parameters with newlines, tabs or 4+ consecutive spaces. */
export function sanitizeParameter(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim();
}

export function contactName(c: ContactForVariables): string {
  return (c.displayName ?? c.profileName ?? '').trim();
}

function fieldValue(field: Extract<VariableSource, { source: 'field' }>['field'], c: ContactForVariables): string {
  switch (field) {
    case 'name':
      return contactName(c);
    case 'firstName':
      return contactName(c).split(/\s+/)[0] ?? '';
    case 'phone':
      return `+${c.waId}`;
    case 'email':
      return c.email ?? '';
    case 'location':
      return c.location ?? '';
  }
}

/** Resolves one variable for one contact. Returns '' when there is no usable value. */
export function resolveVariable(source: VariableSource | undefined, contact: ContactForVariables): string {
  if (!source) return '';
  if (source.source === 'static') return sanitizeParameter(source.value);
  const value = sanitizeParameter(fieldValue(source.field, contact));
  return value || sanitizeParameter(source.fallback ?? '');
}

export type ResolvedVariables =
  | { ok: true; header: string[]; body: string[] }
  | { ok: false; reason: string };

/**
 * Resolves every header/body variable for a contact. A variable with no
 * value (and no fallback) makes the whole recipient fail up front — Meta
 * rejects empty template parameters, and an unfilled "Hi ," message is worse
 * than not sending.
 */
export function resolveVariables(
  template: Pick<MessageTemplate, 'body' | 'headerText' | 'headerType'>,
  mapping: Partial<VariableMapping>,
  contact: ContactForVariables,
): ResolvedVariables {
  const bodyCount = variableCount(template.body);
  const headerCount = template.headerType === 'text' && template.headerText ? Math.min(1, variableCount(template.headerText)) : 0;

  const body: string[] = [];
  for (let i = 0; i < bodyCount; i += 1) {
    const value = resolveVariable(mapping.body?.[i], contact);
    if (!value) return { ok: false, reason: `No value for body variable {{${i + 1}}}` };
    body.push(value);
  }
  const header: string[] = [];
  for (let i = 0; i < headerCount; i += 1) {
    const value = resolveVariable(mapping.header?.[i], contact);
    if (!value) return { ok: false, reason: 'No value for the header variable' };
    header.push(value);
  }
  return { ok: true, header, body };
}

/** Builds the Cloud API `components` array for a template send. */
export function buildTemplateComponents(
  template: Pick<MessageTemplate, 'headerType'>,
  header: string[],
  body: string[],
  headerMediaUrl: string | null,
): TemplateComponent[] {
  const components: TemplateComponent[] = [];

  let headerParams: TemplateParameter[] = [];
  if (template.headerType === 'text' && header.length) {
    headerParams = header.map((text) => ({ type: 'text' as const, text }));
  } else if (template.headerType === 'image' && headerMediaUrl) {
    headerParams = [{ type: 'image', image: { link: headerMediaUrl } }];
  } else if (template.headerType === 'video' && headerMediaUrl) {
    headerParams = [{ type: 'video', video: { link: headerMediaUrl } }];
  } else if (template.headerType === 'document' && headerMediaUrl) {
    headerParams = [{ type: 'document', document: { link: headerMediaUrl } }];
  }
  if (headerParams.length) components.push({ type: 'header', parameters: headerParams });

  if (body.length) components.push({ type: 'body', parameters: body.map((text) => ({ type: 'text' as const, text })) });
  return components;
}

/** The message text as the recipient will see it (stored on the outbound Message). */
export function renderBody(template: Pick<MessageTemplate, 'body'>, body: string[]): string {
  return fillVariables(template.body, body);
}
