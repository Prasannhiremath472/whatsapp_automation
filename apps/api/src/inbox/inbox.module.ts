import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';
import { InboxGateway } from './inbox.gateway';
import { WhatsAppProviderModule } from '../whatsapp-connections/whatsapp-provider.module';

@Module({
  imports: [
    WhatsAppProviderModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET'),
      }),
    }),
  ],
  controllers: [InboxController],
  providers: [InboxService, InboxGateway],
  exports: [InboxService],
})
export class InboxModule {}
