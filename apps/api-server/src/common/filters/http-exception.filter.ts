import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Global HTTP exception filter.
 * Transforms all exceptions into a consistent error envelope:
 *   { code, message, details?, requestId? }
 *
 * Unexpected (non-HTTP) errors become 500s with a generic message in
 * production — never leak internal stack traces to clients.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let code: string;
    let message: string;
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        code = this.statusToCode(status);
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const body = exceptionResponse as Record<string, unknown>;
        code = (body['code'] as string) ?? this.statusToCode(status);
        message = (body['message'] as string) ?? exception.message;
        // class-validator errors come in as an array under 'message'
        if (Array.isArray(body['message'])) {
          code = 'VALIDATION_ERROR';
          message = 'Request validation failed';
          details = body['message'];
        }
      } else {
        code = this.statusToCode(status);
        message = exception.message;
      }
    } else {
      // Unexpected error — 500
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = 'INTERNAL_SERVER_ERROR';
      message = 'An unexpected error occurred';
      this.logger.error(
        `Unhandled exception: ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      timestamp: new Date().toISOString(),
    });
  }

  private statusToCode(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      413: 'PAYLOAD_TOO_LARGE',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
    };
    return map[status] ?? `HTTP_${status}`;
  }
}
