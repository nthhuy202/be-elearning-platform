import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { Observable, map } from 'rxjs';
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';
import { MESSAGES } from '../messages';
import { SKIP_TRANSFORM_KEY } from '../decorators/skip-transform.decorator';

export interface ApiResponse<T> {
  statusCode: number;
  message: string;
  data: T | null;
  timestamp: string;
  path: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  T | ApiResponse<T>
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<T | ApiResponse<T>> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();

    const skipTransform = this.reflector.getAllAndOverride<boolean>(
      SKIP_TRANSFORM_KEY,
      [context.getHandler(), context.getClass()],
    );

    // /metrics trả text thuần theo định dạng Prometheus. Controller của nó do
    // @willsoto/nestjs-prometheus cung cấp nên không gắn @SkipTransform() được
    // -> loại theo đường dẫn.
    if (skipTransform || request.path === '/metrics') {
      return next.handle();
    }

    const message =
      this.reflector.getAllAndOverride<string>(RESPONSE_MESSAGE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? MESSAGES.COMMON.SUCCESS;

    return next.handle().pipe(
      map((data) => ({
        statusCode: response.statusCode,
        message,
        data: data ?? null,
        timestamp: new Date().toISOString(),
        path: request.url,
      })),
    );
  }
}
