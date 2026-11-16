import { CampaignDispatcher } from './campaign-dispatcher.processor';
import { AudienceService } from './audience.service';
import { FakePrisma } from './fake-prisma.spec-support';
import { WhatsAppSendError } from '../whatsapp-connections/whatsapp-provider.interface';

const TENANT = 'tenant-1';

/** Test double for the dispatcher: no real waiting, so backoff paths run instantly. */
class TestDispatcher extends CampaignDispatcher {
  sleeps: number[] = [];
  protected override sleep(ms: number): Promise<void> {
    this.sleeps.push(ms);
    return Promise.resolve();
  }
}

interface Setup {
  db: FakePrisma;
  dispatcher: TestDispatcher;
  provider: { sendTemplateMessage: jest.Mock };
  receipts: { simulate: jest.Mock };
  campaignId: string;
  contactIds: string[];
}

function setup(opts: { contacts?: Partial<Record<string, any>>[]; ratePerSecond?: number; body?: string; mapping?: any } = {}): Setup {
  const db = new FakePrisma();
  db.whatsappConnection.insert({ id: 'conn-1', tenantId: TENANT, phoneNumberId: 'pn-1', connectionStatus: 'connected', isMock: false });
  const template = db.messageTemplate.insert({
    tenantId: TENANT,
    name: 'welcome_offer',
    language: 'en',
    status: 'approved',
    headerType: 'none',
    headerText: null,
    body: opts.body ?? 'Hi {{1}}, welcome!',
  });
  const contacts = (opts.contacts ?? [{ displayName: 'Asha Rao' }, { displayName: 'Bela Shah' }, { displayName: 'Chitra Nair' }]).map((c, i) =>
    db.contact.insert({ tenantId: TENANT, waId: `91987650${String(i).padStart(4, '1')}`, ...c }),
  );
  const campaign = db.broadcastCampaign.insert({
    tenantId: TENANT,
    templateId: template.id,
    name: 'Launch',
    status: 'running',
    variableMapping: opts.mapping ?? { header: [], body: [{ source: 'field', field: 'firstName', fallback: 'there' }] },
  });

  const provider = { sendTemplateMessage: jest.fn(async () => ({ waMessageId: `wamid.${Math.random().toString(36).slice(2)}` })) };
  const receipts = { simulate: jest.fn() };
  const config = { get: (key: string) => (key === 'BROADCAST_RATE_PER_SECOND' ? (opts.ratePerSecond ?? 20) : undefined) };
  const audience = new AudienceService(db as any);
  const dispatcher = new TestDispatcher(db as any, config as any, audience, receipts as any, provider as any);
  return { db, dispatcher, provider, receipts, campaignId: campaign.id, contactIds: contacts.map((c) => c.id) };
}

const campaignOf = (s: Setup) => s.db.broadcastCampaign.rows.find((c) => c.id === s.campaignId)!;
const statuses = (s: Setup) => s.db.broadcastRecipient.rows.map((r) => r.status).sort();

describe('CampaignDispatcher', () => {
  it('sends to every eligible contact, records messages and completes the campaign', async () => {
    const s = setup();
    await s.dispatcher.run(s.campaignId);

    expect(statuses(s)).toEqual(['sent', 'sent', 'sent']);
    const c = campaignOf(s);
    expect(c).toMatchObject({ status: 'completed', totalRecipients: 3, sentCount: 3, failedCount: 0, skippedCount: 0 });
    expect(c.completedAt).toBeInstanceOf(Date);
    expect(c.dispatcherLockedUntil).toBeNull(); // lease released

    // First name resolved from {{1}}, in Cloud API component shape.
    const firstCall = s.provider.sendTemplateMessage.mock.calls.find((call) => (call as any[])[1].endsWith('1'));
    expect(firstCall).toBeDefined();
    expect(s.provider.sendTemplateMessage).toHaveBeenCalledWith(expect.anything(), expect.any(String), 'welcome_offer', 'en', [
      { type: 'body', parameters: [{ type: 'text', text: expect.any(String) }] },
    ]);

    // Each send landed in the inbox as a template message tied to a conversation.
    expect(s.db.message.rows).toHaveLength(3);
    expect(s.db.message.rows[0]).toMatchObject({ direction: 'outbound', senderType: 'system', messageType: 'template', status: 'sent' });
    expect(s.db.message.rows[0]!.content.body).toMatch(/^Hi (Asha|Bela|Chitra), welcome!$/);
    expect(s.db.conversation.rows).toHaveLength(3);
    expect(s.db.broadcastRecipient.rows.every((r) => r.waMessageId && r.messageId && r.sentAt)).toBe(true);
    expect(s.receipts.simulate).toHaveBeenCalledTimes(3);
  });

  it('skips opted-out contacts when the audience is materialised and never messages them', async () => {
    const s = setup({ contacts: [{ displayName: 'Asha' }, { displayName: 'Bela', optedOut: true }] });
    await s.dispatcher.run(s.campaignId);

    expect(statuses(s)).toEqual(['sent', 'skipped']);
    expect(campaignOf(s)).toMatchObject({ totalRecipients: 2, sentCount: 1, skippedCount: 1, status: 'completed' });
    expect(s.provider.sendTemplateMessage).toHaveBeenCalledTimes(1);
  });

  it('skips a contact who opted out after the campaign started but before their turn', async () => {
    const s = setup({ contacts: [{ displayName: 'Asha' }, { displayName: 'Bela' }], ratePerSecond: 1 });
    // The first message triggers a STOP reply from the second contact.
    s.provider.sendTemplateMessage.mockImplementationOnce(async () => {
      s.db.contact.rows[1]!.optedOut = true;
      return { waMessageId: 'wamid.first' };
    });
    await s.dispatcher.run(s.campaignId);

    expect(statuses(s)).toEqual(['sent', 'skipped']);
    expect(s.provider.sendTemplateMessage).toHaveBeenCalledTimes(1);
    expect(campaignOf(s)).toMatchObject({ sentCount: 1, skippedCount: 1 });
  });

  it('fails (without sending) a recipient whose variable has no value and no fallback', async () => {
    const s = setup({
      body: 'Hi {{1}}, from {{2}}',
      contacts: [{ displayName: 'Asha', location: 'Pune' }, { displayName: 'Bela' }],
      mapping: { header: [], body: [{ source: 'field', field: 'firstName' }, { source: 'field', field: 'location' }] },
    });
    await s.dispatcher.run(s.campaignId);

    const failed = s.db.broadcastRecipient.rows.find((r) => r.status === 'failed')!;
    expect(failed.errorCode).toBe('missing_variable');
    expect(failed.errorDetail.message).toContain('{{2}}');
    expect(s.provider.sendTemplateMessage).toHaveBeenCalledTimes(1);
    expect(campaignOf(s)).toMatchObject({ sentCount: 1, failedCount: 1, status: 'completed' });
  });

  it('marks a permanently rejected recipient failed with Meta\'s code and does not retry', async () => {
    const s = setup({ contacts: [{ displayName: 'Asha' }, { displayName: 'Bela' }] });
    s.provider.sendTemplateMessage.mockRejectedValueOnce(new WhatsAppSendError('Not a WhatsApp number', '131026', 400, false));
    await s.dispatcher.run(s.campaignId);

    const failed = s.db.broadcastRecipient.rows.find((r) => r.status === 'failed')!;
    expect(failed).toMatchObject({ errorCode: '131026', attempts: 1 });
    expect(failed.errorDetail.message).toBe('Not a WhatsApp number');
    expect(s.provider.sendTemplateMessage).toHaveBeenCalledTimes(2); // 1 failed + 1 sent, no retry
    expect(campaignOf(s)).toMatchObject({ status: 'completed', sentCount: 1, failedCount: 1 });
  });

  it('marks the whole campaign failed when every message fails', async () => {
    const s = setup({ contacts: [{ displayName: 'Asha' }] });
    s.provider.sendTemplateMessage.mockRejectedValue(new WhatsAppSendError('Bad number', '131026', 400, false));
    await s.dispatcher.run(s.campaignId);
    expect(campaignOf(s)).toMatchObject({ status: 'failed', statusReason: 'All messages failed to send', failedCount: 1, sentCount: 0 });
  });

  it('retries transient errors with backoff and then succeeds', async () => {
    const s = setup({ contacts: [{ displayName: 'Asha' }] });
    s.provider.sendTemplateMessage.mockRejectedValueOnce(new WhatsAppSendError('Rate limit hit', '130429', 429, true));
    await s.dispatcher.run(s.campaignId);

    expect(s.provider.sendTemplateMessage).toHaveBeenCalledTimes(2);
    expect(s.db.broadcastRecipient.rows[0]).toMatchObject({ status: 'sent', attempts: 2 });
    expect(s.dispatcher.sleeps).toEqual([5000]); // backed off once before retrying
    expect(campaignOf(s)).toMatchObject({ status: 'completed', sentCount: 1, failedCount: 0 });
  });

  it('gives up after the maximum number of attempts on persistent transient errors', async () => {
    const s = setup({ contacts: [{ displayName: 'Asha' }] });
    s.provider.sendTemplateMessage.mockRejectedValue(new WhatsAppSendError('Service unavailable', '131016', 503, true));
    await s.dispatcher.run(s.campaignId);

    expect(s.provider.sendTemplateMessage).toHaveBeenCalledTimes(3);
    expect(s.db.broadcastRecipient.rows[0]).toMatchObject({ status: 'failed', attempts: 3, errorCode: '131016' });
    expect(s.dispatcher.sleeps).toEqual([5000, 10000]); // exponential
  });

  it('pauses the campaign on an auth failure and leaves nobody marked failed', async () => {
    const s = setup();
    s.provider.sendTemplateMessage.mockRejectedValue(new WhatsAppSendError('Error validating access token', '190', 401, false, true));
    await s.dispatcher.run(s.campaignId);

    const c = campaignOf(s);
    expect(c.status).toBe('paused');
    expect(c.statusReason).toContain('credentials');
    expect(statuses(s)).toEqual(['pending', 'pending', 'pending']); // all safely resumable
    expect(c).toMatchObject({ failedCount: 0, sentCount: 0 });
    expect(c.dispatcherLockedUntil).toBeNull();
  });

  it('stops promptly when paused mid-run and resumes where it left off', async () => {
    const s = setup({ ratePerSecond: 2, contacts: Array.from({ length: 6 }, (_, i) => ({ displayName: `Person ${i}` })) });
    let calls = 0;
    s.provider.sendTemplateMessage.mockImplementation(async () => {
      calls += 1;
      if (calls === 2) campaignOf(s).status = 'paused'; // user clicks Pause during the first batch
      return { waMessageId: `wamid.${calls}` };
    });
    await s.dispatcher.run(s.campaignId);

    expect(calls).toBe(2); // the in-flight batch finished, nothing further was claimed
    expect(statuses(s).filter((x) => x === 'sent')).toHaveLength(2);
    expect(statuses(s).filter((x) => x === 'pending')).toHaveLength(4);
    expect(campaignOf(s).status).toBe('paused');
    expect(campaignOf(s).dispatcherLockedUntil).toBeNull();

    // Resume: same dispatcher picks up only the remaining recipients, none twice.
    campaignOf(s).status = 'running';
    await s.dispatcher.run(s.campaignId);
    expect(calls).toBe(6);
    expect(campaignOf(s)).toMatchObject({ status: 'completed', sentCount: 6, totalRecipients: 6 });
    const ids = s.db.broadcastRecipient.rows.map((r) => r.waMessageId);
    expect(new Set(ids).size).toBe(6);
  });

  it('fails recipients stuck "sending" by a crashed worker instead of risking a duplicate send', async () => {
    const s = setup({ contacts: [{ displayName: 'Asha' }, { displayName: 'Bela' }] });
    // Simulate: materialised earlier, one recipient was mid-send when the process died.
    for (const id of s.contactIds) s.db.broadcastRecipient.insert({ campaignId: s.campaignId, contactId: id });
    s.db.broadcastRecipient.rows[0]!.status = 'sending';
    campaignOf(s).materializedAt = new Date();
    campaignOf(s).totalRecipients = 2;

    await s.dispatcher.run(s.campaignId);

    const stuck = s.db.broadcastRecipient.rows[0]!;
    expect(stuck).toMatchObject({ status: 'failed', errorCode: 'interrupted' });
    expect(s.provider.sendTemplateMessage).toHaveBeenCalledTimes(1); // only the untouched recipient
    expect(campaignOf(s)).toMatchObject({ failedCount: 1, sentCount: 1, status: 'completed' });
  });

  it('does nothing while another worker holds the lease or the campaign is not running', async () => {
    const s = setup();
    campaignOf(s).dispatcherLockedUntil = new Date(Date.now() + 30_000);
    await s.dispatcher.run(s.campaignId);
    expect(s.provider.sendTemplateMessage).not.toHaveBeenCalled();

    campaignOf(s).dispatcherLockedUntil = null;
    campaignOf(s).status = 'paused';
    await s.dispatcher.run(s.campaignId);
    expect(s.provider.sendTemplateMessage).not.toHaveBeenCalled();
  });

  it('takes over a campaign whose previous worker\'s lease expired', async () => {
    const s = setup({ contacts: [{ displayName: 'Asha' }] });
    campaignOf(s).dispatcherLockedUntil = new Date(Date.now() - 1000);
    await s.dispatcher.run(s.campaignId);
    expect(campaignOf(s).status).toBe('completed');
  });

  it('yields to an earlier-started active campaign of the same tenant (one at a time per number)', async () => {
    const s = setup();
    s.db.broadcastCampaign.insert({
      tenantId: TENANT,
      templateId: 'x',
      name: 'Earlier',
      status: 'running',
      startedAt: new Date(Date.now() - 60_000),
      dispatcherLockedUntil: new Date(Date.now() + 30_000),
    });
    await s.dispatcher.run(s.campaignId);

    expect(s.provider.sendTemplateMessage).not.toHaveBeenCalled();
    expect(campaignOf(s).status).toBe('running'); // stays queued; the scheduler wakes it later
    expect(campaignOf(s).dispatcherLockedUntil).toBeNull();
  });

  it('pauses instead of sending when the WhatsApp account is disconnected or the template unapproved', async () => {
    const s = setup();
    s.db.whatsappConnection.rows[0]!.connectionStatus = 'disconnected';
    await s.dispatcher.run(s.campaignId);
    expect(campaignOf(s)).toMatchObject({ status: 'paused' });
    expect(campaignOf(s).statusReason).toContain('not connected');

    const t = setup();
    t.db.messageTemplate.rows[0]!.status = 'rejected';
    await t.dispatcher.run(t.campaignId);
    expect(campaignOf(t)).toMatchObject({ status: 'paused' });
    expect(campaignOf(t).statusReason).toContain('template');
    expect(t.provider.sendTemplateMessage).not.toHaveBeenCalled();
  });

  it('paces large audiences: at most one batch per second', async () => {
    const s = setup({ ratePerSecond: 5, contacts: Array.from({ length: 12 }, (_, i) => ({ displayName: `P${i}` })) });
    await s.dispatcher.run(s.campaignId);
    expect(campaignOf(s)).toMatchObject({ status: 'completed', sentCount: 12 });
    // 12 recipients at 5/s = batches of 5, 5, 2; the two full batches each wait out the remainder of their second.
    expect(s.dispatcher.sleeps).toHaveLength(2);
    expect(s.dispatcher.sleeps.every((ms) => ms > 0 && ms <= 1000)).toBe(true);
  });
});
