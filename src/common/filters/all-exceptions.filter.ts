import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '../../../generated/prisma/client';
import { MESSAGES } from '../messages';

interface ErrorPayload {
  statusCode: HttpStatus;
  message: string | string[];
  error: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const httpContext = host.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();

    const payload = this.toErrorPayload(exception);

    this.log(request, payload, exception);

    response.status(payload.statusCode).json({
      ...payload,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private toErrorPayload(exception: unknown): ErrorPayload {
    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrismaError(exception);
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: MESSAGES.COMMON.INTERNAL_ERROR,
      error: 'Internal Server Error',
    };
  }

  private fromHttpException(exception: HttpException): ErrorPayload {
    const statusCode = exception.getStatus();
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return { statusCode, message: response, error: exception.name };
    }

    const { message, error } = response as {
      message?: string | string[];
      error?: string;
    };

    return {
      statusCode,
      message: message ?? exception.message,
      error: error ?? exception.name,
    };
  }

  private fromPrismaError(
    exception: Prisma.PrismaClientKnownRequestError,
  ): ErrorPayload {
    switch (exception.code) {
      case 'P2002':
        return {
          statusCode: HttpStatus.CONFLICT,
          message: MESSAGES.COMMON.DUPLICATE_RECORD,
          error: 'Conflict',
        };
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: MESSAGES.COMMON.NOT_FOUND,
          error: 'Not Found',
        };
      case 'P2003':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: MESSAGES.COMMON.INVALID_REFERENCE,
          error: 'Bad Request',
        };
      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: MESSAGES.COMMON.INTERNAL_ERROR,
          error: 'Internal Server Error',
        };
    }
  }

  private log(request: Request, payload: ErrorPayload, exception: unknown) {
    const context = `${request.method} ${request.url} -> ${payload.statusCode}`;

    if (payload.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        context,
        exception instanceof Error ? exception.stack : String(exception),
      );
      return;
    }

    this.logger.warn(`${context} | ${JSON.stringify(payload.message)}`);
  }
}
