import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookProcessor } from './webhook.processor';
import { WebhookWorker } from './webhook.worker';
import { WebhookEventsModule } from './webhook-events.module';
import { RouterModule } from '../router/router.module';
import { InboxModule } from '../inbox/inbox.module';
import { WhatsappConnectionsModule } from '../whatsapp-connections/whatsapp-connections.module';
import { BroadcastModule } from '../broadcast/broadcast.module';
import { ContactsModule } from '../contacts/contacts.module';
import { TemplatesModule } from '../templates/templates.module';

@Module({
  imports: [
    WebhookEventsModule,
    RouterModule,
    InboxModule,
    WhatsappConnectionsModule,
    BroadcastModule,
    ContactsModule,
    TemplatesModule,
  ],
  controllers: [WebhookController],
  providers: [WebhookProcessor, WebhookWorker],
  exports: [WebhookEventsModule],
})
export class WebhookModule {}
