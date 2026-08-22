import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { TokenService } from '../token.service';
import { PRISMA_TOKEN } from '../../database/database.module';

vi.mock('@hotel-app/config', () => ({
  loadConfig: () => ({
    JWT_SECRET: 'test-jwt-secret-min-32-chars-long!!!',
    JWT_REFRESH_SECRET: 'test-refresh-secret-min-32-chars!!!',
    JWT_ACCESS_EXPIRES_IN: '15m',
  }),
}));

function makeDb() {
  const store: Record<string, unknown> = {};
  return {
    refreshToken: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const id = `rt-${Date.now()}`;
        store[data.tokenHash as string] = { id, ...data, revokedAt: null };
        return Promise.resolve({ id, ...data });
      }),
      findUnique: vi.fn(({ where }: { where: { tokenHash: string } }) => {
        const record = store[where.tokenHash] as Record<string, unknown> | undefined;
        if (!record) return Promise.resolve(null);
        return Promise.resolve({
          ...record,
          subject: {
            id: record.subjectId,
            tenantId: 'tenant-001',
            entityType: 'GUEST',
            profile: { room_number: '201' },
          },
        });
      }),
      update: vi.fn(({ where }: { where: { id: string } }) => {
        return Promise.resolve({ id: where.id, revokedAt: new Date() });
      }),
      updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
    },
    accessGrant: {
      findFirst: vi.fn(() => Promise.resolve({ privileges: ['CALLING', 'WIFI'] })),
    },
  };
}

describe('TokenService', () => {
  let service: TokenService;
  let db: ReturnType<typeof makeDb>;

  beforeEach(async () => {
    db = makeDb();
    const module = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: 'test-jwt-secret-min-32-chars-long!!!',
          signOptions: { expiresIn: '15m' },
        }),
      ],
      providers: [
        TokenService,
        { provide: PRISMA_TOKEN, useValue: db },
      ],
    }).compile();

    // Manually wire the JWT service
    const jwtService = module.get(JwtService);
    service = module.get(TokenService);
    // Force-inject jwtService since NestJS module init isn't called in tests
    (service as unknown as { jwtService: JwtService }).jwtService = jwtService;
  });

  describe('issueTokenPair()', () => {
    it('returns access_token, refresh_token, and expires_in', async () => {
      const result = await service.issueTokenPair({
        sub: 'user-001',
        tenant_id: 'tenant-001',
        entity_type: 'GUEST',
        grants: ['CALLING'],
      });

      expect(result.access_token).toBeTruthy();
      expect(result.refresh_token).toBeTruthy();
      expect(result.refresh_token.length).toBe(96); // 48 random bytes * 2 hex chars
      expect(result.expires_in).toBe(900);
      expect(db.refreshToken.create).toHaveBeenCalledOnce();
    });

    it('access_token is a valid JWT with correct payload', async () => {
      const result = await service.issueTokenPair({
        sub: 'user-001',
        tenant_id: 'tenant-001',
        entity_type: 'STAFF',
        grants: ['STAFF_ACCESS'],
      });

      const jwtService = new JwtService({ secret: 'test-jwt-secret-min-32-chars-long!!!' });
      const decoded = jwtService.verify(result.access_token);
      expect(decoded.sub).toBe('user-001');
      expect(decoded.tenant_id).toBe('tenant-001');
      expect(decoded.entity_type).toBe('STAFF');
      expect(decoded.grants).toContain('STAFF_ACCESS');
    });
  });

  describe('refreshAccessToken()', () => {
    it('issues a new token pair after valid refresh', async () => {
      // First, issue a token pair so we have a stored refresh token
      const initial = await service.issueTokenPair({
        sub: 'user-001',
        tenant_id: 'tenant-001',
        entity_type: 'GUEST',
        grants: [],
      });

      const result = await service.refreshAccessToken(initial.refresh_token);
      expect(result.access_token).toBeTruthy();
      expect(result.refresh_token).not.toBe(initial.refresh_token); // rotated
    });

    it('throws when refresh token not found', async () => {
      await expect(
        service.refreshAccessToken('nonexistent-token'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('revokeAllTokensForSubject()', () => {
    it('calls updateMany with the correct subjectId', async () => {
      await service.revokeAllTokensForSubject('user-001');
      expect(db.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { subjectId: 'user-001', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('payloadToUser()', () => {
    it('maps JWT payload to AuthenticatedUser', () => {
      const user = service.payloadToUser({
        sub: 'user-001',
        tenant_id: 'tenant-001',
        entity_type: 'GUEST',
        room: '201',
        grants: ['CALLING', 'WIFI'],
      });

      expect(user.identityId).toBe('user-001');
      expect(user.tenantId).toBe('tenant-001');
      expect(user.entityType).toBe('GUEST');
      expect(user.room).toBe('201');
      expect(user.grants).toEqual(['CALLING', 'WIFI']);
    });
  });
});
