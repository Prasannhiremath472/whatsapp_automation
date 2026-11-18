import { Module } from '@nestjs/common';
import { WebhookDeliveryWorker } from './webhook-delivery.worker';
import { WebhookDispatcher } from './webhook-dispatcher.service';
import { WebhookEndpointsController } from './webhook-endpoints.controller';
import { WebhookEndpointsService } from './webhook-endpoints.service';

@Module({
  controllers: [WebhookEndpointsController],
  providers: [WebhookEndpointsService, WebhookDispatcher, WebhookDeliveryWorker],
})
export class WebhookEndpointsModule {}
