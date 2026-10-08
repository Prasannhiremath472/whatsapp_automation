import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { WhatsappConnectionsModule } from './whatsapp-connections/whatsapp-connections.module';
import { WebhookModule } from './webhook/webhook.module';
import { RouterModule } from './router/router.module';
import { InboxModule } from './inbox/inbox.module';
import { AutomationModule } from './automation/automation.module';
import { BroadcastModule } from './broadcast/broadcast.module';
import { CommerceBotModule } from './commerce-bot/commerce-bot.module';
import { DevModule } from './dev/dev.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

// Dev-only simulation endpoints (POST /dev/simulate-*) — never included in
// the module graph in production, not just disabled by convention.
const devOnlyImports = process.env.NODE_ENV === 'production' ? [] : [DevModule];

@Module({
  imports: [
    ConfigModule,
    EventEmitterModule.forRoot(),
    PrismaModule,
    DatabaseModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    WhatsappConnectionsModule,
    RouterModule,
    InboxModule,
    AutomationModule,
    BroadcastModule,
    CommerceBotModule,
    WebhookModule,
    ...devOnlyImports,
  ],
  providers: [
    // Applied globally; individual routes opt out with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
