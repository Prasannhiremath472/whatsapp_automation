import { Module } from '@nestjs/common';
import { InboxModule } from '../inbox/inbox.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { ClaudeClient } from './claude.client';

@Module({
  imports: [InboxModule],
  controllers: [AiController],
  providers: [AiService, ClaudeClient],
  exports: [AiService],
})
export class AiModule {}
