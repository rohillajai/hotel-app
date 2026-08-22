import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { loadConfig } from '@hotel-app/config';
import { DatabaseModule } from './modules/database/database.module';
import { RedisModule } from './modules/redis/redis.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { IdentityModule } from './modules/identity/identity.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { AccessModule } from './modules/access/access.module';
import { DirectoryModule } from './modules/directory/directory.module';
import { CallsModule } from './modules/calls/calls.module';
import { ServiceRequestsModule } from './modules/service-requests/service-requests.module';

const appConfig = loadConfig();

@Module({
  imports: [
    // ── Config — validates env vars at startup ────────────────────────────────
    NestConfigModule.forRoot({ isGlobal: true }),

    // ── Rate limiting — applied globally via ThrottlerGuard ──────────────────
    ThrottlerModule.forRoot([{
      ttl: appConfig.THROTTLE_TTL_SECONDS * 1000,
      limit: appConfig.THROTTLE_LIMIT,
    }]),

    // ── Cron / scheduled jobs ─────────────────────────────────────────────────
    ScheduleModule.forRoot(),

    // ── Core infrastructure modules ───────────────────────────────────────────
    DatabaseModule,
    RedisModule,

    // ── Feature modules ───────────────────────────────────────────────────────
    HealthModule,
    AuthModule,
    AuditModule,
    IdentityModule,
    DocumentsModule,
    AccessModule,
    DirectoryModule,
    CallsModule,
    ServiceRequestsModule,
  ],
  providers: [
    // Apply rate limiting globally
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
