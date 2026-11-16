import { CampaignDispatcher } from './campaign-dispatcher.processor';
import { AudienceService } from './audience.service';
import { DISPATCHER_CONCURRENCY } from './broadcast-queue.constants';
import { FakePrisma } from './fake-prisma.spec-support';

/** Test double: no real waiting, so backoff paths run instantly. */
class TestDispatcher extends CampaignDispatcher {
  protected override sleep(): Promise<void> {
    return Promise.resolve();
  }
}

async function waitFor(condition: () => boolean, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 5));
  }
}

function build(opts: { campaigns: number; contactsEach?: number; ratePerSecond?: number; send?: () => Promise<{ waMessageId: string }> }) {
  const db = new FakePrisma();
  const campaignIds: string[] = [];
  for (let i = 0; i < opts.campaigns; i++) {
    const tenantId = `tenant-${i}`; // different businesses, so they are allowed to run side by side
    db.whatsappConnection.insert({ tenantId, phoneNumberId: `pn-${i}`, connectionStatus: 'connected', isMock: false });
    const template = db.messageTemplate.insert({ tenantId, name: 'hello', language: 'en', status: 'approved', headerType: 'none', headerText: null, body: 'Hi' });
    for (let c = 0; c < (opts.contactsEach ?? 1); c++) db.contact.insert({ tenantId, waId: `9198700${i}${String(c).padStart(4, '0')}` });
    campaignIds.push(
      db.broadcastCampaign.insert({ tenantId, templateId: template.id, name: `c${i}`, status: 'running', variableMapping: { header: [], body: [] } }).id,
    );
  }
  let n = 0;
  const provider = { sendTemplateMessage: jest.fn(opts.send ?? (async () => ({ waMessageId: `wamid.${++n}` }))) };
  const config = { get: (key: string) => (key === 'BROADCAST_RATE_PER_SECOND' ? (opts.ratePerSecond ?? 20) : undefined) };
  const dispatcher = new TestDispatcher(db as any, config as any, new AudienceService(db as any), { simulate: jest.fn() } as any, provider as any);
  const status = (id: string) => db.broadcastCampaign.rows.find((c) => c.id === id)!;
  return { db, dispatcher, provider, campaignIds, status };
}

describe('CampaignDispatcher in-process queue (replaces Redis/BullMQ)', () => {
  it('runs an enqueued campaign in the background to completion', async () => {
    const { dispatcher, provider, campaignIds, status } = build({ campaigns: 1, contactsEach: 3 });
    dispatcher.enqueue(campaignIds[0]!);

    await waitFor(() => status(campaignIds[0]!).status === 'completed');
    expect(provider.sendTemplateMessage).toHaveBeenCalledTimes(3);
    expect(status(campaignIds[0]!)).toMatchObject({ sentCount: 3, failedCount: 0, dispatcherLockedUntil: null });
  });

  it('ignores a campaign that is already running or waiting (no double sending)', async () => {
    const { dispatcher, provider, campaignIds, status } = build({ campaigns: 1, contactsEach: 3 });
    for (let i = 0; i < 5; i++) dispatcher.enqueue(campaignIds[0]!);

    await waitFor(() => status(campaignIds[0]!).status === 'completed');
    expect(provider.sendTemplateMessage).toHaveBeenCalledTimes(3); // not 15
  });

  it(`runs at most ${DISPATCHER_CONCURRENCY} campaigns at once and starts the rest as slots free up`, async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let inFlight = 0;
    let peak = 0;
    let n = 0;
    const { dispatcher, campaignIds, status } = build({
      campaigns: DISPATCHER_CONCURRENCY + 2,
      send: async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await gate;
        inFlight -= 1;
        return { waMessageId: `wamid.${++n}` };
      },
    });

    campaignIds.forEach((id) => dispatcher.enqueue(id));
    await waitFor(() => inFlight === DISPATCHER_CONCURRENCY);
    await new Promise((r) => setTimeout(r, 50)); // give any extra campaign a chance to (wrongly) start
    expect(inFlight).toBe(DISPATCHER_CONCURRENCY);

    release();
    await waitFor(() => campaignIds.every((id) => status(id).status === 'completed'));
    expect(peak).toBe(DISPATCHER_CONCURRENCY);
  });

  it('on shutdown finishes the current batch, releases the lease and leaves the campaign running so it can resume', async () => {
    let n = 0;
    let shutdown: Promise<void> | undefined;
    const built = build({
      campaigns: 1,
      contactsEach: 3,
      ratePerSecond: 1, // one recipient per batch
      send: async () => {
        if (n === 0) shutdown = built.dispatcher.onModuleDestroy(); // stop requested while the first message is out
        return { waMessageId: `wamid.${++n}` };
      },
    });
    const id = built.campaignIds[0]!;

    built.dispatcher.enqueue(id);
    await waitFor(() => shutdown !== undefined);
    await shutdown;

    expect(built.provider.sendTemplateMessage).toHaveBeenCalledTimes(1);
    expect(built.status(id)).toMatchObject({ status: 'running', sentCount: 1, dispatcherLockedUntil: null });
    expect(built.db.broadcastRecipient.rows.map((r) => r.status).sort()).toEqual(['pending', 'pending', 'sent']);

    // After a "restart" a fresh dispatcher picks the campaign up and finishes it, without re-sending the first one.
    const after = new TestDispatcher(
      built.db as any,
      { get: () => 1 } as any,
      new AudienceService(built.db as any),
      { simulate: jest.fn() } as any,
      built.provider as any,
    );
    await after.run(id);
    expect(built.status(id)).toMatchObject({ status: 'completed', sentCount: 3 });
    expect(built.provider.sendTemplateMessage).toHaveBeenCalledTimes(3);
  });

  it('ignores enqueue after shutdown', async () => {
    const { dispatcher, provider, campaignIds } = build({ campaigns: 1 });
    await dispatcher.onModuleDestroy();
    dispatcher.enqueue(campaignIds[0]!);
    await new Promise((r) => setTimeout(r, 30));
    expect(provider.sendTemplateMessage).not.toHaveBeenCalled();
  });
});
