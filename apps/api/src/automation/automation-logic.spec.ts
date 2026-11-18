import {
  matchesKeywords,
  normalizeText,
  SaveAutomationRequestSchema,
} from '@whatsapp-crm/shared-types';
import { fillContactPlaceholders } from './automation-engine.service';

describe('keyword matching', () => {
  const contains = { keywords: ['price', 'cost'], match: 'contains' as const };

  it('ignores case and punctuation', () => {
    expect(normalizeText('  What\'s the PRICE?! ')).toBe('what s the price');
    expect(matchesKeywords('What is the PRICE?', contains)).toBe(true);
    expect(matchesKeywords('how much does it cost', contains)).toBe(true);
  });

  it('matches whole words, not parts of words', () => {
    expect(matchesKeywords('I like pricey things', contains)).toBe(false);
    expect(matchesKeywords('priceless', contains)).toBe(false);
  });

  it('supports multi-word keywords and exact matching', () => {
    expect(matchesKeywords('do you do home delivery?', { keywords: ['home delivery'], match: 'contains' })).toBe(true);
    expect(matchesKeywords('menu please', { keywords: ['menu'], match: 'equals' })).toBe(false);
    expect(matchesKeywords('Menu', { keywords: ['menu'], match: 'equals' })).toBe(true);
  });

  it('works with non-English text', () => {
    expect(matchesKeywords('मुझे कीमत बताइए', { keywords: ['कीमत'], match: 'contains' })).toBe(true);
  });

  it('never matches an empty message or empty keywords', () => {
    expect(matchesKeywords('', contains)).toBe(false);
    expect(matchesKeywords('hello', { keywords: ['  '], match: 'contains' })).toBe(false);
  });
});

describe('contact placeholders', () => {
  const contact = { displayName: 'Priya Sharma', profileName: null, waId: '919811111111' };
  it('fills name, first name and phone', () => {
    expect(fillContactPlaceholders('Hi {{first_name}} ({{name}}, {{phone}})', contact)).toBe('Hi Priya (Priya Sharma, +919811111111)');
  });
  it('falls back to "there" when the contact has no name', () => {
    expect(fillContactPlaceholders('Hi {{first_name}}', { displayName: null, profileName: null, waId: '1' })).toBe('Hi there');
  });
});

describe('automation validation', () => {
  const step = { type: 'send_text' as const, text: 'Hello' };
  it('needs keywords for a keyword trigger and steps overall', () => {
    expect(SaveAutomationRequestSchema.safeParse({ name: 'x', triggerType: 'keyword', steps: [step] }).success).toBe(false);
    expect(SaveAutomationRequestSchema.safeParse({ name: 'x', triggerType: 'keyword', triggerConfig: { keywords: ['hi'] }, steps: [step] }).success).toBe(true);
    expect(SaveAutomationRequestSchema.safeParse({ name: 'x', triggerType: 'any_message', steps: [] }).success).toBe(false);
  });
  it('does not allow a wait as the last step', () => {
    expect(SaveAutomationRequestSchema.safeParse({ name: 'x', triggerType: 'any_message', steps: [step, { type: 'wait', minutes: 5 }] }).success).toBe(false);
    expect(SaveAutomationRequestSchema.safeParse({ name: 'x', triggerType: 'any_message', steps: [{ type: 'wait', minutes: 5 }, step] }).success).toBe(true);
  });
});
