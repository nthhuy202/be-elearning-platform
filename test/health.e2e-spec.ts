import request from 'supertest';
import type { INestApplication } from '@nestjs/common';

import { createTestApp, resetDb } from './helpers/test-app';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health trả 200', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });

  it('GET /health/ready kết nối được database test', async () => {
    const response = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200);

    expect(response.body).toEqual({ status: 'ok', database: 'up' });
  });

  it('resetDb xoá được dữ liệu', async () => {
    await expect(resetDb(app)).resolves.not.toThrow();
  });
});
