import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { IdentityService } from '../identity.service';
import { AuditService } from '../../audit/audit.service';
import { PRISMA_TOKEN } from '../../database/database.module';

vi.mock('@hotel-app/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hotel-app/core')>();
  return actual; // use real DefaultIdentityMatchingRule
});

function makeDb() {
  return {
    tenant: {
      findUnique: vi.fn(() =>
        Promise.resolve({
          config: { dedup_rules: { match_any: ['booking_ref', 'full_name'] } },
        }),
      ),
    },
    identityRecord: {
      create: vi.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'new-id',
          ...args.data,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
      update: vi.fn((args: { where: { id: string }; data: Record<string, unknown> }) =>
        Promise.resolve({
          id: args.where.id,
          tenantId: 'tenant-001',
          ...args.data,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
      findUnique: vi.fn(() =>
        Promise.resolve({
          id: 'existing-id',
          tenantId: 'tenant-001',
          status: 'PENDING',
          profile: { booking_ref: 'BK-001', full_name: 'Raj' },
        }),
      ),
      findFirst: vi.fn(() => Promise.resolve(null)), // no dedup hit
      findMany: vi.fn(() => Promise.resolve([])),
    },
  };
}

function makeAudit() {
  return { log: vi.fn(), logMany: vi.fn() };
}

describe('IdentityService', () => {
  let service: IdentityService;
  let db: ReturnType<typeof makeDb>;
  let audit: ReturnType<typeof makeAudit>;

  beforeEach(async () => {
    db = makeDb();
    audit = makeAudit();

    const module = await Test.createTestingModule({
      providers: [
        IdentityService,
        { provide: PRISMA_TOKEN, useValue: db },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(IdentityService);
    // Ensure auditService is injected (NestJS DI may skip it for non-decorated deps)
    (service as unknown as { auditService: typeof audit }).auditService = audit;
  });

  describe('createIdentity() — Path A', () => {
    it('creates an ACTIVE identity and writes audit log', async () => {
      const result = await service.createIdentity({
        tenantId: 'tenant-001',
        entityType: 'STAFF',
        profile: { full_name: 'New Staff', email: 'new@hotel.com' },
        createdById: 'admin-001',
        registrationPath: 'A',
      });

      expect(db.identityRecord.create).toHaveBeenCalledOnce();
      const createData = db.identityRecord.create.mock.calls[0]![0].data;
      expect(createData.status).toBe('ACTIVE');
      expect(createData.registrationPath).toBe('A');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'IDENTITY_CREATED_ACTIVE' }),
      );
    });

    it('throws ConflictException when dedup hash matches existing record', async () => {
      (db.identityRecord as any).findFirst = vi.fn(() =>
        Promise.resolve({
          id: 'dup-id',
          tenantId: 'tenant-001',
          status: 'ACTIVE',
          profile: { booking_ref: 'BK-001' },
          createdAt: new Date(),
        }),
      );

      await expect(
        service.createIdentity({
          tenantId: 'tenant-001',
          entityType: 'GUEST',
          profile: { booking_ref: 'BK-001', full_name: 'Someone' },
          registrationPath: 'B',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('approve()', () => {
    it('transitions PENDING → ACTIVE with check-in/out dates', async () => {
      const result = await service.approve('existing-id', {
        checkInDt: new Date('2026-08-22T14:00:00Z'),
        checkOutDt: new Date('2026-08-24T11:00:00Z'),
        roomNumber: '201',
        approvedById: 'staff-001',
      });

      const updateData = db.identityRecord.update.mock.calls[0]![0].data;
      expect(updateData.status).toBe('ACTIVE');
      expect(updateData.approvedById).toBe('staff-001');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'IDENTITY_APPROVED' }),
      );
    });

    it('throws BadRequestException for non-PENDING record', async () => {
      db.identityRecord.findUnique = vi.fn(() =>
        Promise.resolve({ id: 'x', tenantId: 't', status: 'ACTIVE', profile: {} }),
      );

      await expect(
        service.approve('x', {
          checkInDt: new Date(),
          checkOutDt: new Date(),
          approvedById: 'staff',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('reject()', () => {
    it('transitions PENDING → REJECTED with audit', async () => {
      await service.reject('existing-id', 'Invalid docs', 'staff-001');

      const updateData = db.identityRecord.update.mock.calls[0]![0].data;
      expect(updateData.status).toBe('REJECTED');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'IDENTITY_REJECTED' }),
      );
    });
  });

  describe('merge()', () => {
    it('marks duplicate as MERGED with pointer to target', async () => {
      // Set up: dup is PENDING, target is ACTIVE
      let callCount = 0;
      db.identityRecord.findUnique = vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            id: 'dup-id',
            tenantId: 'tenant-001',
            status: 'PENDING',
            profile: {},
          });
        }
        return Promise.resolve({
          id: 'target-id',
          tenantId: 'tenant-001',
          status: 'ACTIVE',
          profile: {},
        });
      });

      await service.merge('dup-id', 'target-id', 'admin-001');

      const updateData = db.identityRecord.update.mock.calls[0]![0].data;
      expect(updateData.status).toBe('MERGED');
      expect(updateData.mergedIntoId).toBe('target-id');
    });

    it('throws when target is not ACTIVE', async () => {
      let callCount = 0;
      db.identityRecord.findUnique = vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ id: 'dup', tenantId: 't', status: 'PENDING', profile: {} });
        }
        return Promise.resolve({ id: 'target', tenantId: 't', status: 'PENDING', profile: {} });
      });

      await expect(
        service.merge('dup', 'target', 'admin'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findOrFail()', () => {
    it('throws NotFoundException when identity does not exist', async () => {
      (db.identityRecord as any).findUnique = vi.fn(() => Promise.resolve(null));
      await expect(service.findByIdOrFail('nonexistent')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
