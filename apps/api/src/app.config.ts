import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { raw } from 'express';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

/** Routes that must stay at a fixed, unversioned URL. */
const UNVERSIONED_ROUTES = ['webhook', 'dev/(.*)', 'files/(.*)'];

/**
 * Shared HTTP configuration used by main.ts and by e2e tests, so tests hit the
 * same URLs and error shapes as production.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  // Meta's webhook URL is registered in the Meta developer console, so it
  // stays unversioned; everything the web apps call lives under /api/v1.
  app.setGlobalPrefix('api/v1', { exclude: UNVERSIONED_ROUTES });

  // Image uploads arrive as the raw request body (no multipart parser needed).
  // The limit is a hair above the 5 MB product limit, which the service re-checks.
  app.use('/api/v1/media', raw({ type: ['image/jpeg', 'image/png'], limit: '5mb' }));

  const origins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins.length ? origins : false, credentials: false });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }));
  app.useGlobalFilters(new HttpExceptionFilter());
}
