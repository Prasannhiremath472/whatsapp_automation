import { Module } from '@nestjs/common';
import { InboxModule } from '../inbox/inbox.module';
import { CommerceBotService } from './commerce-bot.service';
import { CommerceBotFlowEngine } from './commerce-bot-flow.engine';
import { CatalogService } from './catalog.service';
import { OrderPricingService } from './order-pricing.service';
import { CommerceBotCatalogController } from './commerce-bot-catalog.controller';

@Module({
  imports: [InboxModule],
  controllers: [CommerceBotCatalogController],
  providers: [CommerceBotService, CommerceBotFlowEngine, CatalogService, OrderPricingService],
  exports: [CommerceBotService],
})
export class CommerceBotModule {}
