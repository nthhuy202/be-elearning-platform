import { Module } from '@nestjs/common';
import {
  PrometheusModule,
  makeCounterProvider,
  makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';

const httpMetricProviders = [
  makeCounterProvider({
    name: 'http_requests_total',
    help: 'Tổng số HTTP request',
    labelNames: ['method', 'route', 'status'],
  }),
  makeHistogramProvider({
    name: 'http_request_duration_seconds',
    help: 'Thời gian xử lý request',
    labelNames: ['method', 'route', 'status'],
    // Bucket theo ngưỡng thực tế của API này. Mặc định của prom-client
    // nhắm tới hệ thống chậm hơn nhiều.
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 3],
  }),
];

@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: { enabled: true },
    }),
  ],
  providers: httpMetricProviders,
  // MetricsInterceptor được đăng ký ở AppModule qua APP_INTERCEPTOR, nên
  // hai metric này phải export ra ngoài mới inject vào nó được.
  exports: httpMetricProviders,
})
export class MetricsModule {}
