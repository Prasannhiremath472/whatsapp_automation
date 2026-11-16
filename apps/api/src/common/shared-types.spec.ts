import {
  AudienceSchema,
  SaveCampaignRequestSchema,
  SaveTemplateRequestSchema,
  fillVariables,
  normalizeWaId,
  variableCount,
} from '@whatsapp-crm/shared-types';

describe('normalizeWaId', () => {
  it('strips formatting and the plus sign', () => {
    expect(normalizeWaId('+91 98765-43210')).toBe('919876543210');
    expect(normalizeWaId('(202) 555-0100', '1')).toBe('12025550100');
  });

  it('adds the default country code only to national-format numbers', () => {
    expect(normalizeWaId('9876543210', '91')).toBe('919876543210');
    expect(normalizeWaId('09876543210', '91')).toBe('919876543210');
    expect(normalizeWaId('919876543210', '91')).toBe('919876543210');
  });

  it('handles a 00 international prefix', () => {
    expect(normalizeWaId('00919876543210')).toBe('919876543210');
  });

  it('rejects numbers that are too short, too long or empty', () => {
    expect(normalizeWaId('12345')).toBeNull();
    expect(normalizeWaId('1234567890123456')).toBeNull();
    expect(normalizeWaId('')).toBeNull();
    expect(normalizeWaId('abc')).toBeNull();
  });
});

describe('template variables', () => {
  it('counts the highest placeholder', () => {
    expect(variableCount('Hi {{1}}, order {{2}} for {{3}}')).toBe(3);
    expect(variableCount('No variables')).toBe(0);
  });

  it('fills positional values and leaves unknown ones', () => {
    expect(fillVariables('Hi {{1}} / {{2}}', ['A'])).toBe('Hi A / {{2}}');
  });
});

describe('SaveTemplateRequestSchema', () => {
  const valid = { name: 'order_update', category: 'Order Updates', language: 'en', body: 'Hi {{1}}, order {{2}} shipped.' };

  it('accepts a valid template', () => {
    expect(SaveTemplateRequestSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects non-snake-case names', () => {
    expect(SaveTemplateRequestSchema.safeParse({ ...valid, name: 'Order Update' }).success).toBe(false);
  });

  it('rejects gaps in variable numbering', () => {
    const r = SaveTemplateRequestSchema.safeParse({ ...valid, body: 'Hi {{1}} and {{3}}' });
    expect(r.success).toBe(false);
  });

  it('requires header text for a text header and a value for CTA buttons', () => {
    expect(SaveTemplateRequestSchema.safeParse({ ...valid, headerType: 'text' }).success).toBe(false);
    expect(
      SaveTemplateRequestSchema.safeParse({ ...valid, buttons: [{ type: 'cta_url', label: 'Open' }] }).success,
    ).toBe(false);
  });
});

describe('campaign schemas', () => {
  it('requires tags when the audience mode is tags', () => {
    expect(AudienceSchema.safeParse({ mode: 'tags', tags: [] }).success).toBe(false);
    expect(AudienceSchema.safeParse({ mode: 'tags', tags: ['VIP'] }).success).toBe(true);
    expect(AudienceSchema.safeParse({ mode: 'all' }).success).toBe(true);
  });

  it('only accepts https media URLs and well-formed schedules', () => {
    const base = {
      name: 'Launch',
      templateId: '3f2b8c9e-1d4a-4b6e-9a7c-2e5f8d1b0c33',
      audience: { mode: 'all' },
    };
    expect(SaveCampaignRequestSchema.safeParse(base).success).toBe(true);
    expect(SaveCampaignRequestSchema.safeParse({ ...base, headerMediaUrl: 'http://x.test/a.png' }).success).toBe(false);
    expect(SaveCampaignRequestSchema.safeParse({ ...base, schedule: { date: '2026-11-20', time: '09:00' } }).success).toBe(true);
    expect(SaveCampaignRequestSchema.safeParse({ ...base, schedule: { date: '20/11/2026', time: '9am' } }).success).toBe(false);
  });
});
