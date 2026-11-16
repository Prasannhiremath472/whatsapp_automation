import { FakePrisma } from '../broadcast/fake-prisma.spec-support';
import { WebhookEventsService } from './webhook-events.service';
import { WebhookWorker } from './webhook.worker';

const payloadOf = (n: number) => ({ object: 'whatsapp_business_account', entry: [{ id: `waba-${n}`, changes: [] }] });

function setup(process: jest.Mock = jest.fn(async () => undefined)) {
  const db = new FakePrisma();
  const events = new WebhookEventsService(db as any);
  const processor = { process };
  const worker = new WebhookWorker(db as any, events, processor as any);
  return { db, events, processor, worker };
}

describe('WebhookEventsService + WebhookWorker (database-backed webhook inbox)', () => {
  it('stores an event and processes it, then deletes it', async () => {
    const { db, events, processor, worker } = setup();
    await events.enqueue(payloadOf(1));
    expect(db.webhookEvent.rows).toHaveLength(1);
    expect(db.webhookEvent.rows[0]).toMatchObject({ status: 'pending', attempts: 0 });

    await worker.drain();

    expect(processor.process).toHaveBeenCalledTimes(1);
    expect(processor.process).toHaveBeenCalledWith(payloadOf(1));
    expect(db.webhookEvent.rows).toHaveLength(0);
  });

  it('processes events oldest first', async () => {
    const { db, processor, worker } = setup();
    const t = Date.now();
    db.webhookEvent.insert({ payload: payloadOf(2), runAfter: new Date(t - 1000) });
    db.webhookEvent.insert({ payload: payloadOf(1), runAfter: new Date(t - 5000) });
    db.webhookEvent.insert({ payload: payloadOf(3), runAfter: new Date(t - 10) });

    await worker.drain();

    expect(processor.process.mock.calls.map((c) => (c[0] as any).entry[0].id)).toEqual(['waba-1', 'waba-2', 'waba-3']);
  });

  it('leaves a delayed event alone until it is due', async () => {
    const { db, events, processor, worker } = setup();
    await events.enqueue(payloadOf(1), { delayMs: 60_000 });

    await worker.drain();
    expect(processor.process).not.toHaveBeenCalled();
    expect(db.webhookEvent.rows).toHaveLength(1);

    db.webhookEvent.rows[0]!.runAfter = new Date(Date.now() - 1);
    await worker.drain();
    expect(processor.process).toHaveBeenCalledTimes(1);
    expect(db.webhookEvent.rows).toHaveLength(0);
  });

  it('marks a failing event failed (kept for inspection, not retried) and carries on with the next one', async () => {
    const process = jest.fn(async (payload: any) => {
      if (payload.entry[0].id === 'waba-1') throw new Error('boom');
    });
    const { db, events, worker } = setup(process);
    await events.enqueue(payloadOf(1));
    await events.enqueue(payloadOf(2));

    await worker.drain();
    await worker.drain(); // a second pass must not retry the failed one

    expect(process).toHaveBeenCalledTimes(2);
    expect(db.webhookEvent.rows).toHaveLength(1);
    expect(db.webhookEvent.rows[0]).toMatchObject({ status: 'failed', lastError: 'boom', attempts: 1 });
  });

  it('re-runs an event interrupted by a crash once, then gives up', async () => {
    const { db, processor, worker } = setup();
    const long = new Date(Date.now() - 1000);
    db.webhookEvent.insert({ payload: payloadOf(1), status: 'processing', attempts: 1, lockedUntil: long });
    db.webhookEvent.insert({ payload: payloadOf(2), status: 'processing', attempts: 2, lockedUntil: long });

    await worker.drain();

    expect(processor.process).toHaveBeenCalledTimes(1);
    expect(processor.process).toHaveBeenCalledWith(payloadOf(1));
    const left = db.webhookEvent.rows;
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ status: 'failed', lastError: expect.stringContaining('Interrupted') });
  });

  it('does not touch an event another worker is still processing', async () => {
    const { db, processor, worker } = setup();
    db.webhookEvent.insert({ payload: payloadOf(1), status: 'processing', attempts: 1, lockedUntil: new Date(Date.now() + 60_000) });

    await worker.drain();

    expect(processor.process).not.toHaveBeenCalled();
    expect(db.webhookEvent.rows[0]).toMatchObject({ status: 'processing' });
  });

  it('processes each event exactly once even with two workers sharing the database', async () => {
    const calls: string[] = [];
    const process = jest.fn(async (payload: any) => {
      calls.push(payload.entry[0].id);
      await new Promise((r) => setTimeout(r, 5));
    });
    const db = new FakePrisma();
    const events = new WebhookEventsService(db as any);
    const a = new WebhookWorker(db as any, events, { process } as any);
    const b = new WebhookWorker(db as any, events, { process } as any);
    for (let i = 1; i <= 6; i++) await events.enqueue(payloadOf(i));

    await Promise.all([a.drain(), b.drain()]);

    expect([...calls].sort()).toEqual(['waba-1', 'waba-2', 'waba-3', 'waba-4', 'waba-5', 'waba-6']);
    expect(db.webhookEvent.rows).toHaveLength(0);
  });

  it('wakes up immediately when an event is enqueued (no waiting for the poll)', async () => {
    const { events, processor, worker } = setup();
    worker.onModuleInit();
    try {
      await events.enqueue(payloadOf(1));
      for (let i = 0; i < 50 && processor.process.mock.calls.length === 0; i++) await new Promise((r) => setTimeout(r, 10));
      expect(processor.process).toHaveBeenCalledTimes(1);
    } finally {
      await worker.onModuleDestroy();
    }
  });

  it('stops cleanly: nothing is processed after shutdown', async () => {
    const { events, processor, worker } = setup();
    await worker.onModuleDestroy();
    await events.enqueue(payloadOf(1));
    await worker.drain();
    expect(processor.process).not.toHaveBeenCalled();
  });
});
