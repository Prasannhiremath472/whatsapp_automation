import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WHATSAPP_PROVIDER } from './whatsapp-provider.interface';
import { WhatsAppMockProvider } from './providers/whatsapp-mock.provider';
import { WhatsAppCloudApiProvider } from './providers/whatsapp-cloud-api.provider';

/**
 * Selects the WhatsApp provider implementation at boot time based on
 * WHATSAPP_MODE ("mock" | "live", default "mock"), and registers it under
 * the WHATSAPP_PROVIDER injection token so other modules can depend on the
 * interface without caring which concrete implementation backs it.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    WhatsAppMockProvider,
    WhatsAppCloudApiProvider,
    {
      provide: WHATSAPP_PROVIDER,
      useFactory: (
        config: ConfigService,
        mockProvider: WhatsAppMockProvider,
        cloudApiProvider: WhatsAppCloudApiProvider,
      ) => {
        const mode = config.get<string>('WHATSAPP_MODE') ?? 'mock';
        return mode === 'live' ? cloudApiProvider : mockProvider;
      },
      inject: [ConfigService, WhatsAppMockProvider, WhatsAppCloudApiProvider],
    },
  ],
  exports: [WHATSAPP_PROVIDER],
})
export class WhatsAppProviderModule {}
