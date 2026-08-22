import {
  Injectable,
  Inject,
  ConflictException,
  NotFoundException,
  BadRequestException,
  forwardRef,
} from '@nestjs/common';
import type { PrismaClient, IdentityRecord } from '@hotel-app/db';
import { DefaultIdentityMatchingRule, type MatchingKeySet } from '@hotel-app/core';
import { PRISMA_TOKEN } from '../database/database.module';
import { AuditService } from '../audit/audit.service';
import { AccessService } from '../access/access.service';

export interface CreateIdentityParams {
  tenantId: string;
  entityType: 'GUEST' | 'STAFF' | 'ADMIN';
  profile: Record<string, unknown>;
  createdById?: string;
  registrationPath: 'A' | 'B';
}

export interface ApproveParams {
  checkInDt: Date;
  checkOutDt: Date;
  roomNumber?: string;
  approvedById: string;
}

@Injectable()
export class IdentityService {
  private readonly matchingRule = new DefaultIdentityMatchingRule();

  constructor(
    @Inject(PRISMA_TOKEN) private readonly db: PrismaClient,
    private readonly auditService: AuditService,
    @Inject(forwardRef(() => AccessService)) private readonly accessService: AccessService,
  ) {}

  // ─── Create (Path A — admin-initiated) ────────────────────────────────────

  async createIdentity(params: CreateIdentityParams): Promise<IdentityRecord> {
    const dedupKeySet = await this.getDedupRules(params.tenantId);
    await this.checkDedup(params.tenantId, params.profile, dedupKeySet);

    const primaryHash = this.matchingRule.computePrimaryHash(
      params.tenantId,
      params.profile,
      dedupKeySet,
    );

    const identity = await this.db.identityRecord.create({
      data: {
        tenantId: params.tenantId,
        entityType: params.entityType,
        status: params.registrationPath === 'A' ? 'ACTIVE' : 'PENDING',
        registrationPath: params.registrationPath,
        profile: params.profile as object,
        dedupHash: primaryHash,
        createdById: params.createdById,
        approvedAt: params.registrationPath === 'A' ? new Date() : undefined,
        approvedById: params.registrationPath === 'A' ? params.createdById : undefined,
      },
    });

    await this.auditService.log({
      tenantId: params.tenantId,
      actorId: params.createdById,
      action: params.registrationPath === 'A' ? 'IDENTITY_CREATED_ACTIVE' : 'IDENTITY_SELF_REGISTERED',
      entityType: 'IdentityRecord',
      entityId: identity.id,
      after: { status: identity.status, entityType: identity.entityType },
    });

    return identity;
  }

  // ─── Self-register (Path B — guest self-registration) ──────────────────────

  async selfRegister(
    tenantId: string,
    identityId: string,
    profile: Record<string, unknown>,
  ): Promise<IdentityRecord> {
    const dedupKeySet = await this.getDedupRules(tenantId);
    await this.checkDedup(tenantId, profile, dedupKeySet);

    const primaryHash = this.matchingRule.computePrimaryHash(tenantId, profile, dedupKeySet);

    // Update the existing identity (created at OTP verify stage) with booking details
    const updated = await this.db.identityRecord.update({
      where: { id: identityId },
      data: {
        tenantId,
        profile: profile as object,
        dedupHash: primaryHash,
        status: 'PENDING',
        registrationPath: 'B',
      },
    });

    await this.auditService.log({
      tenantId,
      actorId: identityId,
      action: 'IDENTITY_SELF_REGISTERED',
      entityType: 'IdentityRecord',
      entityId: identityId,
      after: { status: 'PENDING', profile },
    });

    return updated;
  }

  // ─── Approve ───────────────────────────────────────────────────────────────

  async approve(
    identityId: string,
    params: ApproveParams,
  ): Promise<IdentityRecord> {
    const identity = await this.findOrFail(identityId);

    if (identity.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot approve an identity with status '${identity.status}'. Only PENDING records can be approved.`,
      );
    }

    const profile = {
      ...(identity.profile as Record<string, unknown>),
      check_in_dt: params.checkInDt.toISOString(),
      check_out_dt: params.checkOutDt.toISOString(),
      ...(params.roomNumber ? { room_number: params.roomNumber } : {}),
    };

    const updated = await this.db.identityRecord.update({
      where: { id: identityId },
      data: {
        status: 'ACTIVE',
        profile: profile as object,
        approvedById: params.approvedById,
        approvedAt: new Date(),
      },
    });

    await this.auditService.log({
      tenantId: identity.tenantId,
      actorId: params.approvedById,
      action: 'IDENTITY_APPROVED',
      entityType: 'IdentityRecord',
      entityId: identityId,
      before: { status: 'PENDING' },
      after: { status: 'ACTIVE', check_in_dt: params.checkInDt, check_out_dt: params.checkOutDt },
    });

    // Issue access grant — this enables calling, WiFi, and service requests
    await this.accessService.issueGrant({
      tenantId: identity.tenantId,
      subjectId: identityId,
      grantType: 'HOTEL_STAY',
      privileges: ['CALLING', 'WIFI', 'SERVICE_REQUEST'],
      validFrom: params.checkInDt,
      validUntil: params.checkOutDt,
      metadata: { room_number: params.roomNumber },
      issuedById: params.approvedById,
    });

    return updated;
  }

  // ─── Reject ────────────────────────────────────────────────────────────────

  async reject(
    identityId: string,
    reason: string,
    rejectedById: string,
  ): Promise<IdentityRecord> {
    const identity = await this.findOrFail(identityId);

    if (identity.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot reject an identity with status '${identity.status}'.`,
      );
    }

    const updated = await this.db.identityRecord.update({
      where: { id: identityId },
      data: { status: 'REJECTED' },
    });

    await this.auditService.log({
      tenantId: identity.tenantId,
      actorId: rejectedById,
      action: 'IDENTITY_REJECTED',
      entityType: 'IdentityRecord',
      entityId: identityId,
      before: { status: 'PENDING' },
      after: { status: 'REJECTED', reason },
    });

    return updated;
  }

  // ─── Merge ─────────────────────────────────────────────────────────────────

  async merge(
    duplicateId: string,
    targetId: string,
    actorId: string,
  ): Promise<IdentityRecord> {
    const [duplicate, target] = await Promise.all([
      this.findOrFail(duplicateId),
      this.findOrFail(targetId),
    ]);

    if (target.status !== 'ACTIVE') {
      throw new BadRequestException('Target record must be ACTIVE to merge into.');
    }

    if (duplicate.tenantId !== target.tenantId) {
      throw new BadRequestException('Cannot merge records across tenants.');
    }

    const updated = await this.db.identityRecord.update({
      where: { id: duplicateId },
      data: {
        status: 'MERGED',
        mergedIntoId: targetId,
      },
    });

    await this.auditService.log({
      tenantId: duplicate.tenantId,
      actorId,
      action: 'IDENTITY_MERGED',
      entityType: 'IdentityRecord',
      entityId: duplicateId,
      before: { status: duplicate.status },
      after: { status: 'MERGED', merged_into: targetId },
    });

    return updated;
  }

  // ─── Lookup ────────────────────────────────────────────────────────────────

  async findById(id: string): Promise<IdentityRecord | null> {
    return this.db.identityRecord.findUnique({ where: { id } });
  }

  async findByIdOrFail(id: string): Promise<IdentityRecord> {
    return this.findOrFail(id);
  }

  async listPending(tenantId: string): Promise<IdentityRecord[]> {
    return this.db.identityRecord.findMany({
      where: { tenantId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async findOrFail(id: string): Promise<IdentityRecord> {
    const record = await this.db.identityRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`Identity record '${id}' not found.`);
    return record;
  }

  /** Load dedup rules from tenant config */
  private async getDedupRules(tenantId: string): Promise<MatchingKeySet> {
    const tenant = await this.db.tenant.findUnique({
      where: { id: tenantId },
      select: { config: true },
    });
    const config = tenant?.config as Record<string, unknown> | null;
    const rules = config?.['dedup_rules'] as { match_any?: string[] } | undefined;
    return { match_any: rules?.match_any ?? ['booking_ref', 'full_name'] };
  }

  /**
   * Check for duplicate identity records.
   * Uses OR-logic: any single matching key collision triggers a 409 response
   * with the existing record in the response body.
   */
  private async checkDedup(
    tenantId: string,
    profile: Record<string, unknown>,
    keySet: MatchingKeySet,
  ): Promise<void> {
    const hashes = this.matchingRule.computeDedupHashes(tenantId, profile, keySet);
    if (hashes.length === 0) return;

    const existing = await this.db.identityRecord.findFirst({
      where: {
        tenantId,
        dedupHash: { in: hashes },
        status: { notIn: ['REJECTED', 'MERGED'] },
      },
    });

    if (existing) {
      throw new ConflictException({
        code: 'DUPLICATE_IDENTITY',
        message:
          'A record matching this identity already exists. ' +
          'Review the existing record and choose to merge or reject.',
        existing_record: {
          id: existing.id,
          status: existing.status,
          profile: existing.profile,
          created_at: existing.createdAt,
        },
      });
    }
  }
}
