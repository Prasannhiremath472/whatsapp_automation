import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BroadcastController } from './broadcast.controller';
import { BroadcastService } from './broadcast.service';
import { BroadcastProcessor } from './broadcast.processor';
import { BROADCAST_SEND_QUEUE } from './broadcast-queue.constants';
import { WhatsAppProviderModule } from '../whatsapp-connections/whatsapp-provider.module';

@Module({
  imports: [BullModule.registerQueue({ name: BROADCAST_SEND_QUEUE }), WhatsAppProviderModule],
  controllers: [BroadcastController],
  providers: [BroadcastService, BroadcastProcessor],
})
export class BroadcastModule {}
