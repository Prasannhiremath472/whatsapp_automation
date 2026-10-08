import { Module } from '@nestjs/common';
import { InboxModule } from '../inbox/inbox.module';
import { AutomationService } from './automation.service';

@Module({
  imports: [InboxModule],
  providers: [AutomationService],
})
export class AutomationModule {}
