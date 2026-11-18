import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { InboxModule } from '../inbox/inbox.module';
import { AutomationEngine } from './automation-engine.service';
import { AutomationScheduler } from './automation-scheduler.service';
import { AutomationsController } from './automations.controller';
import { AutomationsService } from './automations.service';
import { MessageOrchestrator } from './message-orchestrator.service';

@Module({
  imports: [InboxModule, AiModule],
  controllers: [AutomationsController],
  providers: [AutomationsService, AutomationEngine, AutomationScheduler, MessageOrchestrator],
})
export class AutomationModule {}
