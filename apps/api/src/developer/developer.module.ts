import { Module } from '@nestjs/common';
import { ContactsModule } from '../contacts/contacts.module';
import { InboxModule } from '../inbox/inbox.module';
import { ApiKeyGuard } from './api-key.guard';
import { ApiLogInterceptor } from './api-log.interceptor';
import { ApiKeysService } from './api-keys.service';
import { ApiLogsService } from './api-logs.service';
import { ApiKeysController, ApiLogsController } from './developer.controllers';
import { PublicApiController } from './public-api.controller';
import { PublicApiService } from './public-api.service';

@Module({
  imports: [InboxModule, ContactsModule],
  controllers: [ApiKeysController, ApiLogsController, PublicApiController],
  providers: [ApiKeysService, ApiLogsService, ApiKeyGuard, ApiLogInterceptor, PublicApiService],
})
export class DeveloperModule {}
