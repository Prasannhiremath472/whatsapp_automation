import { buildSystemPrompt, toClaudeMessages } from './ai-prompt';

describe('toClaudeMessages', () => {
  it('alternates roles, merging consecutive messages from one side', () => {
    const out = toClaudeMessages([
      { direction: 'inbound', text: 'Hi' },
      { direction: 'inbound', text: 'Are you open?' },
      { direction: 'outbound', text: 'Yes, until 6.' },
      { direction: 'inbound', text: 'Thanks' },
    ]);
    expect(out).toEqual([
      { role: 'user', content: 'Hi\nAre you open?' },
      { role: 'assistant', content: 'Yes, until 6.' },
      { role: 'user', content: 'Thanks' },
    ]);
  });

  it('starts with the customer and ends with the customer', () => {
    const out = toClaudeMessages([
      { direction: 'outbound', text: 'Our offer is live!' }, // a campaign message the customer is replying to
      { direction: 'inbound', text: 'How much?' },
      { direction: 'outbound', text: 'Let me check' },
    ]);
    expect(out).toEqual([{ role: 'user', content: 'How much?' }]);
  });

  it('skips empty messages and returns [] when there is no customer message', () => {
    expect(toClaudeMessages([{ direction: 'inbound', text: '   ' }])).toEqual([]);
    expect(toClaudeMessages([{ direction: 'outbound', text: 'hello' }])).toEqual([]);
  });
});

describe('buildSystemPrompt', () => {
  it('contains the business, instructions, safety rules and knowledge', () => {
    const prompt = buildSystemPrompt({
      agentName: 'Asha',
      businessName: 'Acme Retail',
      instructions: 'Help customers choose products.',
      knowledge: [{ title: 'Opening hours', content: 'Mon-Sat 10 to 6' }],
    });
    expect(prompt).toContain('"Asha"');
    expect(prompt).toContain('Acme Retail');
    expect(prompt).toContain('Help customers choose products.');
    expect(prompt).toContain('handoff_to_human');
    expect(prompt).toContain('## Opening hours\nMon-Sat 10 to 6');
  });

  it('caps very large knowledge instead of growing without limit', () => {
    const big = { title: 'Big', content: 'x'.repeat(10_000) };
    const prompt = buildSystemPrompt({ agentName: 'A', businessName: 'B', instructions: 'Do things well.', knowledge: [big, big, big, big] });
    expect(prompt.length).toBeLessThan(26_000);
  });
});
