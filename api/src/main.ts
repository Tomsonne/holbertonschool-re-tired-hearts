import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  configureApp(app, {
    swagger: config.get('SWAGGER_ENABLED') === 'true',
    trustProxyHops: config.get<number>('TRUST_PROXY_HOPS', 0),
  });
  app.enableShutdownHooks();

  const port = config.get<number>('API_PORT', 3000);
  await app.listen(port);
  Logger.log(`API démarrée sur http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();
