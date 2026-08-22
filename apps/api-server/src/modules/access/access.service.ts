import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import type { PrismaClient, AccessGrant } from '@hotel-app/db';
import type Redis from 'ioredis';
import {
  StaticCredentialWifiAdapter,
  type IWifiAdapter,
} from '@hotel-app/core';
import { PRISMA_TOKEN } from '../database/database.module';
import { REDIS_TOKEN } from '../redis/redis.module';
import { AuditService } from '../audit/audit.service';
import { TokenService } from '../auth/token.service';

export interface IssueGrantParams {
  tenantId: string;
  subjectId: string;
  grantType: 'HOTEL_STAY' | 'STAFF_ROLE';
  privileges: string[];
  validFrom: Date;
  validUntil: Date | null;
  metadata?: Record<string, unknown>;
  issuedById?: string;
}

@Injectable()
export class AccessService {
  private readonly logger = new Logger(AccessService.name);
  private readonly PRIVILEGE_CACHE_TTL = 30; // seconds

  constructor(
    @Inject(PRISMA_TOKEN) private readonly db: PrismaClient,
    @Inject(REDIS_TOKEN) private readonly redis: Redis,
    private readonly auditService: AuditService,
    private readonly tokenService: TokenService,
  ) {}

  // ─── Issue Grant ───────────────────────────────────────────────────────────

  async issueGrant(params: IssueGrantParams): Promise<AccessGrant> {
    const grant = await this.db.accessGrant.create({
      data: {
        tenantId: params.tenantId,
        subjectId: params.subjectId,
        grantType: params.grantType,
        privileges: params.privileges,
        status: 'ACTIVE',
        validFrom: params.validFrom,
        validUntil: params.validUntil,
        metadata: (params.metadata as object) ?? {},
      },
    });

    // Provision WiFi voucher
    await this.provisionWifi(grant);

    await this.auditService.log({
      tenantId: params.tenantId,
      actorId: params.issuedById,
      action: 'GRANT_ISSUED',
      entityType: 'AccessGrant',
      entityId: grant.id,
      after: {
        grantType: grant.grantType,
        validFrom: grant.validFrom,
        validUntil: grant.validUntil,
        privileges: grant.privileges,
      },
    });

    // Invalidate privilege cache
    await this.invalidatePrivilegeCache(params.subjectId);

    this.logger.log(`Grant issued: ${grant.id} for subject ${params.subjectId}`);
    return grant;
  }

  // ─── Revoke Grant ──────────────────────────────────────────────────────────

  async revokeGrant(
    grantId: string,
    reason: string,
    revokedById?: string,
  ): Promise<AccessGrant> {
    const grant = await this.db.accessGrant.findUnique({ where: { id: grantId } });
    if (!grant) throw new NotFoundException(`Grant '${grantId}' not found.`);
    if (grant.status !== 'ACTIVE') {
      throw new BadRequestException(`Grant is already '${grant.status}'.`);
    }

    const updated = await this.db.accessGrant.update({
      where: { id: grantId },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedById: revokedById ?? null,
        revokeReason: reason,
      },
    });

    // Revoke WiFi voucher
    await this.revokeWifiVouchers(grantId);

    // Revoke all sessions for this subject
    await this.tokenService.revokeAllTokensForSubject(grant.subjectId);

    // Invalidate privilege cache
    await this.invalidatePrivilegeCache(grant.subjectId);

    await this.auditService.log({
      tenantId: grant.tenantId,
      actorId: revokedById,
      action: 'GRANT_REVOKED',
      entityType: 'AccessGrant',
      entityId: grantId,
      before: { status: 'ACTIVE' },
      after: { status: 'REVOKED', reason },
    });

    this.logger.log(`Grant revoked: ${grantId} reason='${reason}'`);
    return updated;
  }

  // ─── Restrict Calling ──────────────────────────────────────────────────────

  async restrictCalling(
    subjectId: string,
    restricted: boolean,
    actorId?: string,
  ): Promise<void> {
    const grant = await this.db.accessGrant.findFirst({
      where: { subjectId, status: 'ACTIVE' },
    });
    if (!grant) throw new NotFoundException(`No active grant for subject '${subjectId}'.`);

    await this.db.accessGrant.update({
      where: { id: grant.id },
      data: { callingRestricted: restricted },
    });

    await this.invalidatePrivilegeCache(subjectId);

    await this.auditService.log({
      tenantId: grant.tenantId,
      actorId,
      action: restricted ? 'CALLING_RESTRICTED' : 'CALLING_UNRESTRICTED',
      entityType: 'AccessGrant',
      entityId: grant.id,
      after: { callingRestricted: restricted },
    });
  }

  // ─── Check Privilege (used by signaling server) ────────────────────────────

  async checkPrivilege(
    subjectId: string,
    privilege: string,
  ): Promise<{ allowed: boolean; callingRestricted: boolean }> {
    const cacheKey = `priv:${subjectId}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      const parsed = JSON.parse(cached) as {
        privileges: string[];
        callingRestricted: boolean;
      };
      return {
        allowed: parsed.privileges.includes(privilege),
        callingRestricted: parsed.callingRestricted,
      };
    }

    const grant = await this.db.accessGrant.findFirst({
      where: { subjectId, status: 'ACTIVE' },
      select: { privileges: true, callingRestricted: true },
    });

    if (!grant) {
      await this.redis.set(
        cacheKey,
        JSON.stringify({ privileges: [], callingRestricted: false }),
        'EX',
        this.PRIVILEGE_CACHE_TTL,
      );
      return { allowed: false, callingRestricted: false };
    }

    await this.redis.set(
      cacheKey,
      JSON.stringify({
        privileges: grant.privileges,
        callingRestricted: grant.callingRestricted,
      }),
      'EX',
      this.PRIVILEGE_CACHE_TTL,
    );

    return {
      allowed: grant.privileges.includes(privilege),
      callingRestricted: grant.callingRestricted,
    };
  }

  // ─── Get Active Grant for a Subject ────────────────────────────────────────

  async getActiveGrant(subjectId: string): Promise<AccessGrant | null> {
    return this.db.accessGrant.findFirst({
      where: { subjectId, status: 'ACTIVE' },
      include: { wifiVouchers: { where: { status: 'ACTIVE' } } },
    });
  }

  // ─── Expire Grants (called by cron job) ────────────────────────────────────

  async expireGrants(): Promise<number> {
    // Atomic: UPDATE ... WHERE to avoid double-processing
    const expired = await this.db.accessGrant.findMany({
      where: {
        status: 'ACTIVE',
        validUntil: { lte: new Date() },
      },
      select: { id: true, subjectId: true, tenantId: true },
    });

    if (expired.length === 0) return 0;

    // Process each grant — use sequential to avoid race conditions on tokens
    for (const grant of expired) {
      try {
        await this.revokeGrant(grant.id, 'SCHEDULED_EXPIRY');
      } catch (err) {
        // Grant may have been revoked between findMany and revokeGrant (idempotent)
        this.logger.warn(`Expiry skipped for ${grant.id}: ${(err as Error).message}`);
      }
    }

    this.logger.log(`Expiry job: ${expired.length} grants expired`);
    return expired.length;
  }

  // ─── Private: WiFi provisioning ────────────────────────────────────────────

  private async provisionWifi(grant: AccessGrant): Promise<void> {
    const wifiAdapter = await this.getWifiAdapter(grant.tenantId);
    if (!wifiAdapter || !(await wifiAdapter.isAvailable())) {
      this.logger.warn(`WiFi adapter not available for tenant ${grant.tenantId}, skipping.`);
      return;
    }

    try {
      const result = await wifiAdapter.provisionVoucher({
        grantId: grant.id,
        subjectId: grant.subjectId,
        tenantId: grant.tenantId,
        validFrom: grant.validFrom,
        validUntil: grant.validUntil,
        roomIdentifier: ((grant.metadata as Record<string, unknown>)?.['room_number'] as string) ?? '',
      });

      await this.db.wifiVoucher.create({
        data: {
          tenantId: grant.tenantId,
          grantId: grant.id,
          subjectId: grant.subjectId,
          ssid: result.ssid,
          credential: result.credential, // TODO: encrypt before storage
          status: 'ACTIVE',
          externalId: result.externalId ?? null,
        },
      });
    } catch (err) {
      this.logger.error(`WiFi provisioning failed for grant ${grant.id}`, (err as Error).stack);
      // Non-fatal — grant is still issued, WiFi can be provisioned manually
    }
  }

  private async revokeWifiVouchers(grantId: string): Promise<void> {
    const vouchers = await this.db.wifiVoucher.findMany({
      where: { grantId, status: 'ACTIVE' },
    });

    if (vouchers.length === 0) return;

    const wifiAdapter = await this.getWifiAdapterForGrant(grantId);

    for (const voucher of vouchers) {
      try {
        await wifiAdapter?.revokeVoucher(voucher.externalId ?? undefined);
      } catch (err) {
        this.logger.warn(`WiFi revocation failed for voucher ${voucher.id}: ${(err as Error).message}`);
      }
    }

    await this.db.wifiVoucher.updateMany({
      where: { grantId, status: 'ACTIVE' },
      data: { status: 'REVOKED' },
    });
  }

  private async getWifiAdapter(tenantId: string): Promise<IWifiAdapter | null> {
    const tenant = await this.db.tenant.findUnique({
      where: { id: tenantId },
      select: { config: true },
    });
    const config = tenant?.config as Record<string, unknown> | null;
    const wifi = config?.['wifi'] as { ssid?: string; credential?: string } | undefined;

    if (!wifi?.ssid || !wifi?.credential) return null;

    return new StaticCredentialWifiAdapter({
      ssid: wifi.ssid,
      credential: wifi.credential,
    });
  }

  private async getWifiAdapterForGrant(grantId: string): Promise<IWifiAdapter | null> {
    const grant = await this.db.accessGrant.findUnique({
      where: { id: grantId },
      select: { tenantId: true },
    });
    if (!grant) return null;
    return this.getWifiAdapter(grant.tenantId);
  }

  private async invalidatePrivilegeCache(subjectId: string): Promise<void> {
    await this.redis.del(`priv:${subjectId}`);
  }
}
