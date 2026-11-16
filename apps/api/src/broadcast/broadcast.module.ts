import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WhatsAppProviderModule } from '../whatsapp-connections/whatsapp-provider.module';
import { WEBHOOK_EVENTS_QUEUE } from '../webhook/webhook-queue.constants';
import { AudienceService } from './audience.service';
import { BROADCAST_SEND_QUEUE } from './broadcast-queue.constants';
import { CampaignDispatcher } from './campaign-dispatcher.processor';
import { CampaignScheduler } from './campaign-scheduler.service';
import { CampaignTracker } from './campaign-tracker.service';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { MockReceiptSimulator } from './mock-receipt.simulator';

@Module({
  imports: [
    BullModule.registerQueue({ name: BROADCAST_SEND_QUEUE }),
    // Used only by MockReceiptSimulator to feed simulated receipts into the webhook pipeline.
    BullModule.registerQueue({ name: WEBHOOK_EVENTS_QUEUE }),
    WhatsAppProviderModule,
  ],
  controllers: [CampaignsController],
  providers: [AudienceService, CampaignsService, CampaignDispatcher, CampaignScheduler, CampaignTracker, MockReceiptSimulator],
  exports: [CampaignTracker],
})
export class BroadcastModule {}
