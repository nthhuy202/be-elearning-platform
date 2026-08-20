import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

@Module({
  imports: [
    PrometheusModule.register({
      // Endpoint mặc định đã là /metrics, khai rõ cho dễ đọc.
      path: '/metrics',

      defaultMetrics: {
        // Tự thu event loop lag, heap, GC, CPU của Node.
        // Đây là thứ kubectl top không bao giờ cho biết.
        enabled: true,
      },
    }),
  ],
})
export class MetricsModule {}
