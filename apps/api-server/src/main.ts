import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { loadConfig } from '@hotel-app/config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { RequestLoggerInterceptor } from './common/interceptors/request-logger.interceptor';

async function bootstrap() {
  const config = loadConfig();

  const app = await NestFactory.create(AppModule, {
    logger: config.NODE_ENV === 'production'
      ? ['warn', 'error']
      : ['log', 'debug', 'warn', 'error'],
  });

  // ── URI versioning — all routes under /v1 ──────────────────────────────────
  app.enableVersioning({ type: VersioningType.URI });

  // ── Global prefix ──────────────────────────────────────────────────────────
  app.setGlobalPrefix('api', { exclude: ['health'] });

  // ── CORS ───────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: config.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
  });

  // ── Global pipes ───────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // strip unknown properties
      forbidNonWhitelisted: true, // throw on unknown properties
      transform: true,           // auto-transform to DTO types
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Global filters & interceptors ──────────────────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new RequestLoggerInterceptor());

  // ── Swagger (dev/staging only) ─────────────────────────────────────────────
  if (config.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Hotel App API')
      .setDescription('In-App Check-In & WiFi-Based Voice Intercom — Phase 1')
      .setVersion('1.0')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Tenant-ID' }, 'tenant-id')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(config.PORT);
  console.warn(`[api-server] Listening on port ${config.PORT} (${config.NODE_ENV})`);
  if (config.NODE_ENV !== 'production') {
    console.warn(`[api-server] Swagger UI: http://localhost:${config.PORT}/api/docs`);
  }
}

bootstrap().catch((err) => {
  console.error('[api-server] Fatal startup error:', err);
  process.exit(1);
});
