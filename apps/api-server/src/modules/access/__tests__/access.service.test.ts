import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AccessService } from '../access.service';
import { AuditService } from '../../audit/audit.service';
import { TokenService } from '../../auth/token.service';
import { PRISMA_TOKEN } from '../../database/database.module';
import { REDIS_TOKEN } from '../../redis/redis.module';

vi.mock('@hotel-app/config', () => ({
  loadConfig: () => ({
    JWT_SECRET: 'test-secret-min-32-chars-long!!!!!!!',
    JWT_REFRESH_SECRET: 'test-refresh-min-32-chars-long!!!!!',
    JWT_ACCESS_EXPIRES_IN: '15m',
  }),
}));

function makeDb() {
  return {
    accessGrant: {
      create: vi.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'grant-001',
          ...args.data,
          metadata: args.data.metadata ?? {},
        }),
      ),
      findUnique: vi.fn(() =>
        Promise.resolve({
          id: 'grant-001',
          tenantId: 'tenant-001',
          subjectId: 'subject-001',
          status: 'ACTIVE',
          privileges: ['CALLING', 'WIFI'],
          callingRestricted: false,
          metadata: {},
        }),
      ),
      findFirst: vi.fn(() =>
        Promise.resolve({
          id: 'grant-001',
          tenantId: 'tenant-001',
          subjectId: 'subject-001',
          status: 'ACTIVE',
          privileges: ['CALLING', 'WIFI'],
          callingRestricted: false,
        }),
      ),
      findMany: vi.fn(() => Promise.resolve([])),
      update: vi.fn((args: { where: { id: string }; data: Record<string, unknown> }) =>
        Promise.resolve({ id: args.where.id, ...args.data }),
      ),
    },
    wifiVoucher: {
      create: vi.fn(() => Promise.resolve({ id: 'wifi-001' })),
      findMany: vi.fn(() => Promise.resolve([])),
      updateMany: vi.fn(() => Promise.resolve({ count: 0 })),
    },
    tenant: {
      findUnique: vi.fn(() =>
        Promise.resolve({
          config: { wifi: { ssid: 'TestWifi', credential: 'TestPass123' } },
        }),
      ),
    },
  };
}

function makeRedis() {
  return {
    get: vi.fn(() => Promise.resolve(null)),
    set: vi.fn(() => Promise.resolve('OK')),
    del: vi.fn(() => Promise.resolve(1)),
  };
}

describe('AccessService', () => {
  let service: AccessService;
  let db: ReturnType<typeof makeDb>;
  let redis: ReturnType<typeof makeRedis>;
  let audit: { log: ReturnType<typeof vi.fn> };
  let tokenService: { revokeAllTokensForSubject: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    db = makeDb();
    redis = makeRedis();
    audit = { log: vi.fn(), logMany: vi.fn() } as any;
    tokenService = { revokeAllTokensForSubject: vi.fn() };

    const module = await Test.createTestingModule({
      providers: [
        AccessService,
        { provide: PRISMA_TOKEN, useValue: db },
        { provide: REDIS_TOKEN, useValue: redis },
        { provide: AuditService, useValue: audit },
        { provide: TokenService, useValue: tokenService },
      ],
    }).compile();

    service = module.get(AccessService);
    // Force-inject mocks
    (service as any).auditService = audit;
    (service as any).tokenService = tokenService;
  });

  describe('issueGrant()', () => {
    it('creates grant, provisions wifi, logs audit, invalidates cache', async () => {
      const result = await service.issueGrant({
        tenantId: 'tenant-001',
        subjectId: 'subject-001',
        grantType: 'HOTEL_STAY',
        privileges: ['CALLING', 'WIFI'],
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 86400_000),
        issuedById: 'staff-001',
      });

      expect(db.accessGrant.create).toHaveBeenCalledOnce();
      expect(db.wifiVoucher.create).toHaveBeenCalledOnce();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'GRANT_ISSUED' }),
      );
      expect(redis.del).toHaveBeenCalledWith('priv:subject-001');
    });
  });

  describe('revokeGrant()', () => {
    it('revokes grant, revokes tokens, invalidates cache, logs audit', async () => {
      await service.revokeGrant('grant-001', 'EARLY_CHECKOUT', 'staff-001');

      expect(db.accessGrant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'REVOKED' }),
        }),
      );
      expect(tokenService.revokeAllTokensForSubject).toHaveBeenCalledWith('subject-001');
      expect(redis.del).toHaveBeenCalledWith('priv:subject-001');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'GRANT_REVOKED' }),
      );
    });

    it('throws NotFoundException for non-existent grant', async () => {
      (db.accessGrant as any).findUnique = vi.fn(() => Promise.resolve(null));
      await expect(
        service.revokeGrant('nonexistent', 'test'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when grant is already revoked', async () => {
      (db.accessGrant as any).findUnique = vi.fn(() =>
        Promise.resolve({ id: 'x', status: 'REVOKED', subjectId: 's' }),
      );
      await expect(
        service.revokeGrant('x', 'test'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('checkPrivilege()', () => {
    it('returns cached result if available', async () => {
      (redis as any).get = vi.fn(() =>
        Promise.resolve(JSON.stringify({ privileges: ['CALLING'], callingRestricted: false })),
      );

      const result = await service.checkPrivilege('subject-001', 'CALLING');
      expect(result.allowed).toBe(true);
      expect(result.callingRestricted).toBe(false);
      expect(db.accessGrant.findFirst).not.toHaveBeenCalled();
    });

    it('queries DB when cache miss, then caches result', async () => {
      const result = await service.checkPrivilege('subject-001', 'CALLING');
      expect(result.allowed).toBe(true);
      expect(redis.set).toHaveBeenCalledWith(
        'priv:subject-001',
        expect.any(String),
        'EX',
        30,
      );
    });

    it('returns allowed=false when no active grant exists', async () => {
      (db.accessGrant as any).findFirst = vi.fn(() => Promise.resolve(null));
      const result = await service.checkPrivilege('no-grant', 'CALLING');
      expect(result.allowed).toBe(false);
    });
  });

  describe('restrictCalling()', () => {
    it('sets callingRestricted=true on the active grant', async () => {
      await service.restrictCalling('subject-001', true, 'admin-001');

      expect(db.accessGrant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { callingRestricted: true },
        }),
      );
      expect(redis.del).toHaveBeenCalledWith('priv:subject-001');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CALLING_RESTRICTED' }),
      );
    });
  });

  describe('expireGrants()', () => {
    it('revokes expired grants and returns count', async () => {
      db.accessGrant.findMany = vi.fn(() =>
        Promise.resolve([
          { id: 'g1', subjectId: 's1', tenantId: 't1' },
          { id: 'g2', subjectId: 's2', tenantId: 't1' },
        ]),
      );

      const count = await service.expireGrants();
      expect(count).toBe(2);
    });

    it('returns 0 when no grants are expired', async () => {
      db.accessGrant.findMany = vi.fn(() => Promise.resolve([]));
      const count = await service.expireGrants();
      expect(count).toBe(0);
    });
  });
});
