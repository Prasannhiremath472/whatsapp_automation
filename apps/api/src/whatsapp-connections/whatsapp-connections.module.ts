import { Module } from '@nestjs/common';
import { WhatsappConnectionsController } from './whatsapp-connections.controller';
import { WhatsappConnectionsService } from './whatsapp-connections.service';
import { WhatsAppProviderModule } from './whatsapp-provider.module';

@Module({
  imports: [WhatsAppProviderModule],
  controllers: [WhatsappConnectionsController],
  providers: [WhatsappConnectionsService],
  exports: [WhatsappConnectionsService, WhatsAppProviderModule],
})
export class WhatsappConnectionsModule {}
