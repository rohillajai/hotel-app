import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DirectoryService } from '../directory.service';
import { PRISMA_TOKEN } from '../../database/database.module';

function makeDb() {
  return {
    orgUnit: {
      findMany: vi.fn(() =>
        Promise.resolve([
          { id: 'root', tenantId: 't1', parentId: null, name: 'Hotel', unitType: 'ORGANIZATION' },
          { id: 'dept-1', tenantId: 't1', parentId: 'root', name: 'Reception', unitType: 'DEPARTMENT' },
          { id: 'dept-2', tenantId: 't1', parentId: 'root', name: 'Housekeeping', unitType: 'DEPARTMENT' },
        ]),
      ),
      create: vi.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'new-unit', ...args.data }),
      ),
      findFirst: vi.fn(() =>
        Promise.resolve({ id: 'dept-1', tenantId: 't1', name: 'Reception' }),
      ),
    },
    directoryEntry: {
      create: vi.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'entry-1', ...args.data }),
      ),
      findFirst: vi.fn(() =>
        Promise.resolve({ id: 'entry-1', tenantId: 't1', isActive: true }),
      ),
      findMany: vi.fn(() =>
        Promise.resolve([
          { id: 'entry-1', displayName: 'Raj', designation: 'Front Desk', isActive: true },
        ]),
      ),
      update: vi.fn((args: { where: { id: string }; data: Record<string, unknown> }) =>
        Promise.resolve({ id: args.where.id, ...args.data }),
      ),
    },
    $queryRawUnsafe: vi.fn(() =>
      Promise.resolve([
        { id: 'entry-1', display_name: 'Raj', designation: 'Front Desk Officer' },
      ]),
    ),
  };
}

describe('DirectoryService', () => {
  let service: DirectoryService;
  let db: ReturnType<typeof makeDb>;

  beforeEach(async () => {
    db = makeDb();
    const module = await Test.createTestingModule({
      providers: [
        DirectoryService,
        { provide: PRISMA_TOKEN, useValue: db },
      ],
    }).compile();
    service = module.get(DirectoryService);
  });

  describe('getOrgTree()', () => {
    it('returns hierarchical tree with Hotel > [Reception, Housekeeping]', async () => {
      const tree = await service.getOrgTree('t1');
      expect(tree).toHaveLength(1);
      expect(tree[0]!.name).toBe('Hotel');
      expect(tree[0]!.children).toHaveLength(2);
      expect(tree[0]!.children.map((c) => c.name)).toContain('Reception');
      expect(tree[0]!.children.map((c) => c.name)).toContain('Housekeeping');
    });
  });

  describe('createOrgUnit()', () => {
    it('creates a new org unit with correct data', async () => {
      await service.createOrgUnit({
        tenantId: 't1',
        parentId: 'root',
        name: 'Spa',
        unitType: 'DEPARTMENT',
      });
      expect(db.orgUnit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Spa',
          unitType: 'DEPARTMENT',
          parentId: 'root',
        }),
      });
    });
  });

  describe('createEntry()', () => {
    it('creates a directory entry linked to org unit and identity', async () => {
      const result = await service.createEntry({
        tenantId: 't1',
        orgUnitId: 'dept-1',
        identityId: 'identity-1',
        displayName: 'Raj Kumar',
        designation: 'Front Desk Officer',
      });
      expect(db.directoryEntry.create).toHaveBeenCalledOnce();
      expect(result.displayName).toBe('Raj Kumar');
    });

    it('throws NotFoundException when org unit does not exist', async () => {
      (db.orgUnit as any).findFirst = vi.fn(() => Promise.resolve(null));
      await expect(
        service.createEntry({
          tenantId: 't1',
          orgUnitId: 'nonexistent',
          identityId: 'x',
          displayName: 'Test',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deactivateEntry()', () => {
    it('sets isActive = false', async () => {
      await service.deactivateEntry('entry-1', 't1');
      expect(db.directoryEntry.update).toHaveBeenCalledWith({
        where: { id: 'entry-1' },
        data: { isActive: false },
      });
    });

    it('throws NotFoundException for unknown entry', async () => {
      (db.directoryEntry as any).findFirst = vi.fn(() => Promise.resolve(null));
      await expect(
        service.deactivateEntry('unknown', 't1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('search()', () => {
    it('calls raw query with sanitized tsquery and returns results', async () => {
      const results = await service.search('t1', 'Raj');
      expect(db.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('to_tsquery'),
        't1',
        'Raj:*',
        10,
      );
      expect(results).toHaveLength(1);
    });

    it('returns empty array for empty query', async () => {
      const results = await service.search('t1', '   ');
      expect(results).toHaveLength(0);
      expect(db.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it('handles multi-word queries with AND semantics', async () => {
      await service.search('t1', 'Front Desk');
      expect(db.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.any(String),
        't1',
        'Front:* & Desk:*',
        10,
      );
    });
  });
});
