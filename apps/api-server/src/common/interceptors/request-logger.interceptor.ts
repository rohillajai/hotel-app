import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request, Response } from 'express';

/**
 * Logs each request as a structured JSON line:
 *   { method, url, statusCode, durationMs, tenantId? }
 * No PII (no request bodies, no auth tokens).
 */
@Injectable()
export class RequestLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const { method, url } = req;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<Response>();
          this.logger.log(
            JSON.stringify({
              method,
              url,
              statusCode: res.statusCode,
              durationMs: Date.now() - start,
            }),
          );
        },
        error: () => {
          // Error logging is handled by HttpExceptionFilter
        },
      }),
    );
  }
}
