import { Module } from '@nestjs/common';
import { WhatsAppProviderModule } from '../whatsapp-connections/whatsapp-provider.module';
import { WebhookEventsModule } from '../webhook/webhook-events.module';
import { AudienceService } from './audience.service';
import { CampaignDispatcher } from './campaign-dispatcher.processor';
import { CampaignScheduler } from './campaign-scheduler.service';
import { CampaignTracker } from './campaign-tracker.service';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { MockReceiptSimulator } from './mock-receipt.simulator';

@Module({
  imports: [
    // Used only by MockReceiptSimulator to feed simulated receipts into the webhook pipeline.
    WebhookEventsModule,
    WhatsAppProviderModule,
  ],
  controllers: [CampaignsController],
  providers: [AudienceService, CampaignsService, CampaignDispatcher, CampaignScheduler, CampaignTracker, MockReceiptSimulator],
  exports: [CampaignTracker],
})
export class BroadcastModule {}
