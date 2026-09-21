import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { API_PREFIX } from '@pdf-memo/shared';
import express, { type Express } from 'express';
import { AppModule } from './app.module';

/** 로컬 서버·서버리스·e2e 테스트가 공유하는 앱 설정 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  const origins = (process.env.WEB_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (origins.length > 0) {
    app.enableCors({ origin: origins, credentials: true });
  }
}

/**
 * Express 인스턴스 위에 Nest 앱을 올려 돌려준다.
 * Vercel 함수는 이 Express 핸들러를 그대로 호출하고, 로컬에서는 listen한다.
 */
export async function createApp(): Promise<Express> {
  const server = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    logger: ['error', 'warn', 'log'],
  });
  configureApp(app);
  await app.init();
  return server;
}
