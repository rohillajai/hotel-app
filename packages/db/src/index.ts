import { PrismaClient } from '@prisma/client';

// ─── PrismaClient Singleton ────────────────────────────────────────────────────
// Prevents multiple instances during hot reload in development.
// In production there is only ever one instance.

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  });
}

export const db: PrismaClient =
  globalThis.__prisma ?? createPrismaClient();

if (process.env['NODE_ENV'] !== 'production') {
  globalThis.__prisma = db;
}

// Re-export the generated types so consumers don't need to import from @prisma/client directly
export { Prisma, PrismaClient } from '@prisma/client';
export type {
  Tenant,
  IdentityRecord,
  OrgUnit,
  DirectoryEntry,
  AccessGrant,
  WifiVoucher,
  CallLog,
  AbuseReport,
  ServiceRequest,
  RefreshToken,
  PushSubscription,
  RetentionRule,
  DataSubjectRecord,
  AuditLog,
  TenantType,
  EntityType,
  IdentityStatus,
  RegistrationPath,
  OrgUnitType,
  GrantStatus,
  GrantType,
  WifiVoucherStatus,
  CallOutcome,
  AbuseReportStatus,
  ServiceRequestStatus,
  PurposeCategory,
} from '@prisma/client';
