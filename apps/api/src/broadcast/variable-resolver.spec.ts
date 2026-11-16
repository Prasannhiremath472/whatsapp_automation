import type { VariableMapping } from '@whatsapp-crm/shared-types';
import { buildTemplateComponents, renderBody, resolveVariables, sanitizeParameter } from './variable-resolver';

const contact = {
  waId: '919876543210',
  displayName: 'Priya Sharma',
  profileName: null,
  email: 'priya@example.com',
  location: null,
};

const template = { body: 'Hi {{1}}, your batch in {{2}} starts soon.', headerText: null, headerType: 'none' as const };

describe('resolveVariables', () => {
  it('fills body variables from contact fields and static text', () => {
    const mapping: VariableMapping = {
      header: [],
      body: [
        { source: 'field', field: 'firstName' },
        { source: 'static', value: 'Pune' },
      ],
    };
    expect(resolveVariables(template, mapping, contact)).toEqual({ ok: true, header: [], body: ['Priya', 'Pune'] });
  });

  it('uses the fallback when the contact has no value', () => {
    const mapping: VariableMapping = {
      header: [],
      body: [
        { source: 'field', field: 'name' },
        { source: 'field', field: 'location', fallback: 'your city' },
      ],
    };
    expect(resolveVariables(template, mapping, contact)).toEqual({ ok: true, header: [], body: ['Priya Sharma', 'your city'] });
  });

  it('fails the recipient when a value is missing and there is no fallback', () => {
    const mapping: VariableMapping = {
      header: [],
      body: [
        { source: 'field', field: 'name' },
        { source: 'field', field: 'location' },
      ],
    };
    const result = resolveVariables(template, mapping, contact);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('{{2}}');
  });

  it('fails when the mapping has fewer entries than the template has variables', () => {
    expect(resolveVariables(template, { header: [], body: [{ source: 'static', value: 'x' }] }, contact).ok).toBe(false);
  });

  it('resolves a text header variable', () => {
    const t = { body: 'Hello', headerType: 'text' as const, headerText: 'Offer for {{1}}' };
    const mapping: VariableMapping = { header: [{ source: 'field', field: 'firstName' }], body: [] };
    expect(resolveVariables(t, mapping, contact)).toEqual({ ok: true, header: ['Priya'], body: [] });
  });

  it('formats phone as an international number', () => {
    const t = { body: 'Call {{1}}', headerText: null, headerType: 'none' as const };
    expect(resolveVariables(t, { header: [], body: [{ source: 'field', field: 'phone' }] }, contact)).toEqual({
      ok: true,
      header: [],
      body: ['+919876543210'],
    });
  });
});

describe('sanitizeParameter', () => {
  it('removes newlines/tabs and long space runs that WhatsApp rejects', () => {
    expect(sanitizeParameter('a\nb\tc      d')).toBe('a b c   d');
  });
});

describe('buildTemplateComponents', () => {
  it('builds header + body parameters in Cloud API shape', () => {
    expect(buildTemplateComponents({ headerType: 'text' }, ['Priya'], ['Priya', 'Pune'], null)).toEqual([
      { type: 'header', parameters: [{ type: 'text', text: 'Priya' }] },
      { type: 'body', parameters: [{ type: 'text', text: 'Priya' }, { type: 'text', text: 'Pune' }] },
    ]);
  });

  it('uses the media URL for an image header', () => {
    expect(buildTemplateComponents({ headerType: 'image' }, [], [], 'https://cdn.example.com/a.png')).toEqual([
      { type: 'header', parameters: [{ type: 'image', image: { link: 'https://cdn.example.com/a.png' } }] },
    ]);
  });

  it('sends no components for a template without variables', () => {
    expect(buildTemplateComponents({ headerType: 'none' }, [], [], null)).toEqual([]);
  });
});

describe('renderBody', () => {
  it('substitutes the resolved values', () => {
    expect(renderBody(template, ['Priya', 'Pune'])).toBe('Hi Priya, your batch in Pune starts soon.');
  });
});
