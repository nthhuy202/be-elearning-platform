import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Request, Response } from 'express';
import { Counter, Histogram } from 'prom-client';
import { Observable, tap } from 'rxjs';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(
    @InjectMetric('http_requests_total')
    private readonly requests: Counter<string>,
    @InjectMetric('http_request_duration_seconds')
    private readonly duration: Histogram<string>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();

    if (request.path === '/metrics') {
      return next.handle();
    }

    // route.path là MẪU ('/courses/:id'), không phải URL thật. Dùng URL thật
    // sẽ sinh một chuỗi thời gian cho mỗi id -> Prometheus phình (cardinality).
    // @types/express khai Request.route là `any`, phải ép kiểu tường minh.
    const route =
      (request.route as { path?: string } | undefined)?.path ?? 'unknown';

    const stop = this.duration.startTimer({ method: request.method, route });

    return next.handle().pipe(
      tap({
        next: () =>
          this.record(
            http.getResponse<Response>().statusCode,
            request.method,
            route,
            stop,
          ),
        error: (err: { status?: number }) =>
          this.record(err.status ?? 500, request.method, route, stop),
      }),
    );
  }

  private record(
    status: number,
    method: string,
    route: string,
    stop: (labels?: Record<string, string | number>) => void,
  ) {
    const labels = { method, route, status: String(status) };
    this.requests.inc(labels);
    stop(labels);
  }
}
