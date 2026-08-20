import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  configureApp(app);

  const port = app.get(ConfigService).get<number>('PORT') ?? 8080;

  await app.listen(port);
}
bootstrap();
