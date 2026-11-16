import { Module } from '@nestjs/common';
import { WebhookEventsService } from './webhook-events.service';

/** Just the enqueue side, so other modules can feed the webhook pipeline without depending on the whole WebhookModule. */
@Module({
  providers: [WebhookEventsService],
  exports: [WebhookEventsService],
})
export class WebhookEventsModule {}
