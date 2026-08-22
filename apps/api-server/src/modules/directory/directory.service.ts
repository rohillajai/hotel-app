import {
  Injectable,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaClient, OrgUnit, DirectoryEntry } from '@hotel-app/db';
import { PRISMA_TOKEN } from '../database/database.module';

export interface OrgUnitTree extends OrgUnit {
  children: OrgUnitTree[];
}

@Injectable()
export class DirectoryService {
  constructor(@Inject(PRISMA_TOKEN) private readonly db: PrismaClient) {}

  // ─── Org Units ─────────────────────────────────────────────────────────────

  /** Get the full org unit tree for a tenant */
  async getOrgTree(tenantId: string): Promise<OrgUnitTree[]> {
    const units = await this.db.orgUnit.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });

    // Build tree from flat list
    const map = new Map<string, OrgUnitTree>();
    const roots: OrgUnitTree[] = [];

    for (const unit of units) {
      map.set(unit.id, { ...unit, children: [] });
    }

    for (const unit of units) {
      const node = map.get(unit.id)!;
      if (unit.parentId) {
        const parent = map.get(unit.parentId);
        parent?.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  /** Create a new org unit */
  async createOrgUnit(params: {
    tenantId: string;
    parentId?: string;
    name: string;
    unitType: 'ORGANIZATION' | 'DEPARTMENT' | 'TEAM' | 'DIVISION';
    metadata?: Record<string, unknown>;
  }): Promise<OrgUnit> {
    return this.db.orgUnit.create({
      data: {
        tenantId: params.tenantId,
        parentId: params.parentId ?? null,
        name: params.name,
        unitType: params.unitType,
        metadata: (params.metadata as object) ?? {},
      },
    });
  }

  // ─── Directory Entries ─────────────────────────────────────────────────────

  /** Add a person to the directory */
  async createEntry(params: {
    tenantId: string;
    orgUnitId: string;
    identityId: string;
    displayName: string;
    designation?: string;
  }): Promise<DirectoryEntry> {
    // Verify org unit exists and belongs to tenant
    const orgUnit = await this.db.orgUnit.findFirst({
      where: { id: params.orgUnitId, tenantId: params.tenantId },
    });
    if (!orgUnit) throw new NotFoundException(`Org unit '${params.orgUnitId}' not found.`);

    return this.db.directoryEntry.create({
      data: {
        tenantId: params.tenantId,
        orgUnitId: params.orgUnitId,
        identityId: params.identityId,
        displayName: params.displayName,
        designation: params.designation ?? null,
        isActive: true,
      },
    });
  }

  /** Update a directory entry */
  async updateEntry(
    entryId: string,
    tenantId: string,
    data: { displayName?: string; designation?: string; orgUnitId?: string },
  ): Promise<DirectoryEntry> {
    const entry = await this.db.directoryEntry.findFirst({
      where: { id: entryId, tenantId },
    });
    if (!entry) throw new NotFoundException(`Directory entry '${entryId}' not found.`);

    return this.db.directoryEntry.update({
      where: { id: entryId },
      data: {
        ...(data.displayName !== undefined ? { displayName: data.displayName } : {}),
        ...(data.designation !== undefined ? { designation: data.designation } : {}),
        ...(data.orgUnitId !== undefined ? { orgUnitId: data.orgUnitId } : {}),
      },
    });
  }

  /** Deactivate a directory entry (soft delete) */
  async deactivateEntry(entryId: string, tenantId: string): Promise<DirectoryEntry> {
    const entry = await this.db.directoryEntry.findFirst({
      where: { id: entryId, tenantId },
    });
    if (!entry) throw new NotFoundException(`Directory entry '${entryId}' not found.`);

    return this.db.directoryEntry.update({
      where: { id: entryId },
      data: { isActive: false },
    });
  }

  /** List active entries for a given org unit (department) */
  async listByOrgUnit(orgUnitId: string, tenantId: string): Promise<DirectoryEntry[]> {
    return this.db.directoryEntry.findMany({
      where: { orgUnitId, tenantId, isActive: true },
      orderBy: { displayName: 'asc' },
    });
  }

  /** List all active entries for a tenant */
  async listAll(tenantId: string): Promise<DirectoryEntry[]> {
    return this.db.directoryEntry.findMany({
      where: { tenantId, isActive: true },
      include: { orgUnit: { select: { id: true, name: true, unitType: true } } },
      orderBy: { displayName: 'asc' },
    });
  }

  // ─── Search ────────────────────────────────────────────────────────────────

  /**
   * Full-text search on display_name + designation.
   * Uses the GIN index (idx_dir_fts) for performance.
   * Phase 1: exposed publicly for name search.
   * Phase 2: will also be used for designation-based search ("Joint Secretary, Dept X").
   *
   * @internal designation-only search: not exposed via HTTP in Phase 1 but
   * the underlying query already includes it in the tsvector.
   */
  async search(tenantId: string, query: string, limit = 10): Promise<DirectoryEntry[]> {
    if (!query.trim()) return [];

    // Sanitize query for tsquery: split into words, join with &
    const sanitized = query
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => `${w}:*`) // prefix matching
      .join(' & ');

    // Use raw query for GIN full-text search (Prisma doesn't support this natively)
    const results = await this.db.$queryRawUnsafe<DirectoryEntry[]>(
      `
      SELECT de.*
      FROM directory_entries de
      WHERE de.tenant_id = $1
        AND de.is_active = TRUE
        AND to_tsvector('english', de.display_name || ' ' || COALESCE(de.designation, ''))
            @@ to_tsquery('english', $2)
      ORDER BY ts_rank(
        to_tsvector('english', de.display_name || ' ' || COALESCE(de.designation, '')),
        to_tsquery('english', $2)
      ) DESC
      LIMIT $3
      `,
      tenantId,
      sanitized,
      limit,
    );

    return results;
  }
}
