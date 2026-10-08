import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { WEBHOOK_EVENTS_QUEUE } from './webhook-queue.constants';
import type { WebhookPayload } from './webhook-payload.types';
import { RouterService } from '../router/router.service';
import { InboxService } from '../inbox/inbox.service';

/**
 * Consumes queued raw webhook payloads. For each entry[].changes[], resolves
 * the owning tenant via phoneNumberId, then dispatches to InboxService for
 * message ingestion or status updates. Used both by the real POST /webhook
 * path and by the dev simulate-inbound-message endpoint (which enqueues
 * onto the same queue so it exercises the identical code path).
 */
@Processor(WEBHOOK_EVENTS_QUEUE)
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    private readonly router: RouterService,
    private readonly inbox: InboxService,
  ) {
    super();
  }

  async process(job: Job<WebhookPayload>): Promise<void> {
    const payload = job.data;

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        const phoneNumberId = value?.metadata?.phone_number_id;
        if (!phoneNumberId) {
          this.logger.warn(`Webhook change missing metadata.phone_number_id; dropping. entryId=${entry.id}`);
          continue;
        }

        const resolved = await this.router.resolveTenantByPhoneNumberId(phoneNumberId);
        if (!resolved) {
          // RouterService already logs the warning; nothing more to do.
          continue;
        }

        if (value.messages?.length) {
          await this.inbox.ingestInboundMessage(resolved.tenantId, resolved.connectionId, value);
        }

        if (value.statuses?.length) {
          await this.inbox.ingestStatusUpdate(resolved.tenantId, value.statuses);
        }
      }
    }
  }
}
