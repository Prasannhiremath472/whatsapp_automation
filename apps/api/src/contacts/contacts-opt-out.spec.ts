import { FakePrisma } from '../broadcast/fake-prisma.spec-support';
import { ContactsService } from './contacts.service';

const TENANT = 'tenant-1';
const WA_ID = '919876543210';

function setup() {
  const db = new FakePrisma();
  const contact = db.contact.insert({ tenantId: TENANT, waId: WA_ID, displayName: 'Asha' });
  const service = new ContactsService(db as any);
  const say = (body: string, type = 'text') =>
    service.handleInboundMessages(TENANT, [{ from: WA_ID, id: 'wamid.1', timestamp: '1700000000', type, text: { body } }]);
  return { contact, say };
}

describe('ContactsService.handleInboundMessages (opt-out keywords)', () => {
  it.each(['STOP', 'stop', ' Stop. ', 'Unsubscribe', 'opt out', 'STOP ALL'])('opts the contact out on "%s"', async (text) => {
    const { contact, say } = setup();
    await say(text);
    expect(contact.optedOut).toBe(true);
    expect(contact.optedOutAt).toBeInstanceOf(Date);
  });

  it.each(['cancel', 'Cancel my order', 'end', 'quit', 'please stop calling me tomorrow', 'stopping by at 5', 'hello'])(
    'does NOT opt the contact out on "%s" (could be a normal reply)',
    async (text) => {
      const { contact, say } = setup();
      await say(text);
      expect(contact.optedOut).toBe(false);
    },
  );

  it('opts the contact back in on START', async () => {
    const { contact, say } = setup();
    await say('STOP');
    await say('start');
    expect(contact.optedOut).toBe(false);
    expect(contact.optedOutAt).toBeNull();
  });

  it('only reads text messages, but still records the interaction time', async () => {
    const { contact, say } = setup();
    await say('STOP', 'image');
    expect(contact.optedOut).toBe(false);
    expect(contact.lastInteractionAt).toBeInstanceOf(Date);
  });

  it('never touches another business\'s contact with the same number', async () => {
    const db = new FakePrisma();
    const mine = db.contact.insert({ tenantId: TENANT, waId: WA_ID });
    const theirs = db.contact.insert({ tenantId: 'tenant-2', waId: WA_ID });
    await new ContactsService(db as any).handleInboundMessages(TENANT, [
      { from: WA_ID, id: 'w', timestamp: '1700000000', type: 'text', text: { body: 'STOP' } },
    ]);
    expect(mine.optedOut).toBe(true);
    expect(theirs.optedOut).toBe(false);
  });
});
