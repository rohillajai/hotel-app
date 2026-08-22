import { Injectable, Inject } from '@nestjs/common';
import type { PrismaClient } from '@hotel-app/db';
import { PRISMA_TOKEN } from '../database/database.module';

export interface AuditLogEntry {
  tenantId: string;
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown>;
}

/**
 * AuditService — append-only audit trail for all state changes.
 *
 * The audit_logs table has DB-level rules preventing UPDATE and DELETE.
 * This service only creates entries — never modifies or deletes them.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(PRISMA_TOKEN) private readonly db: PrismaClient) {}

  async log(entry: AuditLogEntry): Promise<void> {
    await this.db.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        actorId: entry.actorId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before as object ?? undefined,
        after: entry.after as object ?? undefined,
        meta: (entry.meta as object) ?? {},
      },
    });
  }

  /** Batch log — used for bulk operations */
  async logMany(entries: AuditLogEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await this.db.auditLog.createMany({
      data: entries.map((e) => ({
        tenantId: e.tenantId,
        actorId: e.actorId ?? null,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        before: e.before as object ?? undefined,
        after: e.after as object ?? undefined,
        meta: (e.meta as object) ?? {},
      })),
    });
  }
}
