import { CampaignTracker } from './campaign-tracker.service';
import { FakePrisma } from './fake-prisma.spec-support';

const TENANT = 'tenant-1';
const at = (s: number) => String(1_700_000_000 + s);

function setup() {
  const db = new FakePrisma();
  const campaign = db.broadcastCampaign.insert({ tenantId: TENANT, status: 'completed', totalRecipients: 1, sentCount: 1 });
  const recipient = db.broadcastRecipient.insert({ campaignId: campaign.id, contactId: 'c1', status: 'sent', waMessageId: 'wamid.A' });
  const tracker = new CampaignTracker(db as any);
  const status = (id: string, s: string, extra: object = {}) => ({ id, status: s, timestamp: at(0), recipient_id: '919', ...extra });
  return { db, tracker, campaign, recipient, status };
}

describe('CampaignTracker', () => {
  it('moves sent -> delivered -> read and counts each step once', async () => {
    const { tracker, campaign, recipient, status } = setup();
    await tracker.handleStatuses(TENANT, [status('wamid.A', 'delivered')]);
    expect(recipient.status).toBe('delivered');
    expect(campaign).toMatchObject({ deliveredCount: 1, readCount: 0 });

    await tracker.handleStatuses(TENANT, [status('wamid.A', 'read')]);
    expect(recipient.status).toBe('read');
    expect(campaign).toMatchObject({ deliveredCount: 1, readCount: 1 });
    expect(recipient.readAt).toBeInstanceOf(Date);
  });

  it('handles "read" arriving before "delivered" (counts both, then ignores the late delivered)', async () => {
    const { tracker, campaign, recipient, status } = setup();
    await tracker.handleStatuses(TENANT, [status('wamid.A', 'read')]);
    expect(recipient.status).toBe('read');
    expect(campaign).toMatchObject({ deliveredCount: 1, readCount: 1 });
    expect(recipient.deliveredAt).toBeInstanceOf(Date);

    await tracker.handleStatuses(TENANT, [status('wamid.A', 'delivered')]);
    expect(recipient.status).toBe('read'); // never moves backwards
    expect(campaign).toMatchObject({ deliveredCount: 1, readCount: 1 });
  });

  it('is idempotent when Meta retries a webhook', async () => {
    const { tracker, campaign, status } = setup();
    const batch = [status('wamid.A', 'delivered'), status('wamid.A', 'delivered'), status('wamid.A', 'read'), status('wamid.A', 'read')];
    await tracker.handleStatuses(TENANT, batch);
    await tracker.handleStatuses(TENANT, batch);
    expect(campaign).toMatchObject({ deliveredCount: 1, readCount: 1 });
  });

  it('turns a sent message that later fails into a failure with Meta\'s reason', async () => {
    const { tracker, campaign, recipient, status } = setup();
    await tracker.handleStatuses(TENANT, [
      status('wamid.A', 'failed', { errors: [{ code: 131049, title: 'Message not delivered', message: 'Ecosystem engagement limit' }] }),
    ]);
    expect(recipient).toMatchObject({ status: 'failed', errorCode: '131049' });
    expect(recipient.errorDetail.message).toBe('Ecosystem engagement limit');
    expect(campaign).toMatchObject({ sentCount: 0, failedCount: 1 });
  });

  it('ignores a stale "failed" receipt for a message that was already delivered', async () => {
    const { tracker, campaign, recipient, status } = setup();
    await tracker.handleStatuses(TENANT, [status('wamid.A', 'delivered'), status('wamid.A', 'failed')]);
    expect(recipient.status).toBe('delivered');
    expect(campaign.failedCount).toBe(0);
  });

  it('ignores receipts for other tenants and for non-campaign messages', async () => {
    const { tracker, campaign, recipient, status } = setup();
    await tracker.handleStatuses('another-tenant', [status('wamid.A', 'read')]);
    await tracker.handleStatuses(TENANT, [status('wamid.UNKNOWN', 'read')]);
    expect(recipient.status).toBe('sent');
    expect(campaign).toMatchObject({ deliveredCount: 0, readCount: 0 });
  });

  it('keeps processing the rest of a batch when one receipt cannot be applied', async () => {
    const { db, tracker, status } = setup();
    const campaign2 = db.broadcastCampaign.insert({ tenantId: TENANT, status: 'completed' });
    const r2 = db.broadcastRecipient.insert({ campaignId: campaign2.id, contactId: 'c2', status: 'sent', waMessageId: 'wamid.B' });
    const original = db.broadcastCampaign.update.bind(db.broadcastCampaign);
    let first = true;
    db.broadcastCampaign.update = async (args: any) => {
      if (first) {
        first = false;
        throw new Error('transient db error');
      }
      return original(args);
    };
    await tracker.handleStatuses(TENANT, [status('wamid.A', 'delivered'), status('wamid.B', 'delivered')]);
    expect(r2.status).toBe('delivered');
  });
});
