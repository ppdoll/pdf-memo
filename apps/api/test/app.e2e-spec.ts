import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HealthResponseSchema, MetaResponseSchema } from '@pdf-memo/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

describe('API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health matches the shared HealthResponse schema', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    const body = HealthResponseSchema.parse(res.body);
    expect(body.status).toBe('ok');
  });

  it('GET /api/v1/meta matches the shared MetaResponse schema and reports sync disabled', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/meta').expect(200);
    const body = MetaResponseSchema.parse(res.body);
    expect(body.features.sync).toBe(false);
    expect(body.apiVersion).toBe('0.1.0');
  });

  it('unknown routes return 404', async () => {
    await request(app.getHttpServer()).get('/api/v1/nope').expect(404);
    await request(app.getHttpServer()).get('/health').expect(404);
  });
});
