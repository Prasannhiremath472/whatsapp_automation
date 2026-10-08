import { Module } from '@nestjs/common';
import { DevController } from './dev.controller';
import { WebhookModule } from '../webhook/webhook.module';

/**
 * Dev-only module. Imported by AppModule ONLY when NODE_ENV !== 'production'
 * (see app.module.ts) — the controller itself also double-checks at request
 * time (DevController.assertNotProduction) as defence in depth, but the
 * primary guarantee is that the routes don't exist at all in a production
 * build's module graph.
 */
@Module({
  imports: [WebhookModule],
  controllers: [DevController],
})
export class DevModule {}
