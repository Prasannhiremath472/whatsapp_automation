import { Module } from '@nestjs/common';
import { WhatsAppProviderModule } from '../whatsapp-connections/whatsapp-provider.module';
import { MediaModule } from '../media/media.module';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

@Module({
  imports: [WhatsAppProviderModule, MediaModule],
  controllers: [TemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
