import request from 'supertest';
import type { INestApplication } from '@nestjs/common';

import { createTestApp } from './helpers/test-app';

describe('Metrics (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /metrics trả text thuần, không bọc JSON', async () => {
    const response = await request(app.getHttpServer())
      .get('/metrics')
      .expect(200);

    // TransformInterceptor bọc mọi response thành {statusCode, data, ...}.
    // Prometheus không parse được JSON -> phải loại /metrics ra.
    expect(response.text).toContain('# TYPE');
    expect(response.text).not.toContain('"statusCode"');
  });

  it('có metric mặc định của Node', async () => {
    const response = await request(app.getHttpServer()).get('/metrics');

    expect(response.text).toContain('nodejs_eventloop_lag_seconds');
    expect(response.text).toContain('process_resident_memory_bytes');
  });
});
