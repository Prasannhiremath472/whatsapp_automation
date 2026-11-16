import { Injectable, Logger } from '@nestjs/common';
import type { WebhookPayload } from './webhook-payload.types';
import { RouterService } from '../router/router.service';
import { InboxService } from '../inbox/inbox.service';
import { CampaignTracker } from '../broadcast/campaign-tracker.service';
import { ContactsService } from '../contacts/contacts.service';
import { TemplatesService } from '../templates/templates.service';

/**
 * Handles one stored raw webhook payload (called by WebhookWorker). For each
 * entry[].changes[], resolves the owning tenant via phoneNumberId, then
 * dispatches to InboxService for message ingestion or status updates. Used
 * both by the real POST /webhook path and by the dev simulate-inbound-message
 * endpoint (which stores events the same way so it exercises the identical
 * code path).
 */
@Injectable()
export class WebhookProcessor {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    private readonly router: RouterService,
    private readonly inbox: InboxService,
    private readonly tracker: CampaignTracker,
    private readonly contacts: ContactsService,
    private readonly templates: TemplatesService,
  ) {}

  async process(payload: WebhookPayload): Promise<void> {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;

        // Template approval/rejection events are keyed by WABA id (entry.id) and carry no phone number.
        if (change.field === 'message_template_status_update') {
          await this.templates.applyStatusEvent(entry.id, value as unknown as Parameters<TemplatesService['applyStatusEvent']>[1]);
          continue;
        }

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
          await this.contacts.handleInboundMessages(resolved.tenantId, value.messages);
        }

        if (value.statuses?.length) {
          await this.inbox.ingestStatusUpdate(resolved.tenantId, value.statuses);
          await this.tracker.handleStatuses(resolved.tenantId, value.statuses);
        }
      }
    }
  }
}
