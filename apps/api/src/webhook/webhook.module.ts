import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WebhookController } from './webhook.controller';
import { WebhookProcessor } from './webhook.processor';
import { WEBHOOK_EVENTS_QUEUE } from './webhook-queue.constants';
import { RouterModule } from '../router/router.module';
import { InboxModule } from '../inbox/inbox.module';
import { WhatsappConnectionsModule } from '../whatsapp-connections/whatsapp-connections.module';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
        const url = new URL(redisUrl);
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            password: url.password || undefined,
          },
        };
      },
    }),
    BullModule.registerQueue({ name: WEBHOOK_EVENTS_QUEUE }),
    RouterModule,
    InboxModule,
    WhatsappConnectionsModule,
  ],
  controllers: [WebhookController],
  providers: [WebhookProcessor],
  exports: [BullModule],
})
export class WebhookModule {}
