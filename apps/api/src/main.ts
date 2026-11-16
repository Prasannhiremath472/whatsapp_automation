import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp } from "./app.config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true }); // the raw body is needed to verify Meta's webhook signature
  configureApp(app);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port} (REST under /api/v1)`);
}

bootstrap();
