/**
 * Seed script — packages/db/prisma/seed.ts
 *
 * Creates the minimum data needed to run the app locally:
 *   - Platform-wide retention rules (DPDP defaults)
 *   - One pilot hotel tenant with correct config
 *   - Hotel org tree: root org → 3 departments
 *   - One admin identity + directory entry
 *   - One staff identity per department (reception, housekeeping, room service)
 *
 * Run: pnpm --filter @hotel-app/db db:seed
 * Safe to re-run: uses upsert / findFirst patterns throughout.
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = 12;

// ─── Seed data constants ──────────────────────────────────────────────────────

const PILOT_HOTEL_ID = '00000000-0000-0000-0000-000000000001';
const PILOT_ORG_UNIT_ID = '00000000-0000-0000-0001-000000000001';
const DEPT_RECEPTION_ID = '00000000-0000-0000-0001-000000000002';
const DEPT_HOUSEKEEPING_ID = '00000000-0000-0000-0001-000000000003';
const DEPT_ROOM_SERVICE_ID = '00000000-0000-0000-0001-000000000004';

const ADMIN_IDENTITY_ID = '00000000-0000-0000-0002-000000000001';
const STAFF_RECEPTION_ID = '00000000-0000-0000-0002-000000000002';
const STAFF_HOUSEKEEPING_ID = '00000000-0000-0000-0002-000000000003';
const STAFF_ROOM_SERVICE_ID = '00000000-0000-0000-0002-000000000004';

async function main() {
  console.log('🌱 Starting seed...\n');

  // ── 1. Platform-wide retention rules ────────────────────────────────────────
  console.log('📋 Seeding retention rules...');

  const retentionDefaults = [
    {
      purposeCategory: 'KYC_DOCUMENT' as const,
      retentionDays: 365,
      statutory: true,
      description:
        'Guest registration documents retained 1 year per police guest-register requirements. ' +
        'Cannot be erased on guest request — statutory override.',
    },
    {
      purposeCategory: 'BOOKING_PROFILE' as const,
      retentionDays: 90,
      statutory: false,
      description: 'Booking profile data retained 90 days post-checkout. Erasable on guest request.',
    },
    {
      purposeCategory: 'CALL_METADATA' as const,
      retentionDays: 90,
      statutory: false,
      description:
        'Call metadata (no audio) retained 90 days for misuse investigation. Erasable on guest request.',
    },
    {
      purposeCategory: 'SERVICE_REQUEST' as const,
      retentionDays: 30,
      statutory: false,
      description: 'Service request records retained 30 days post-checkout.',
    },
    {
      purposeCategory: 'PUSH_SUBSCRIPTION' as const,
      retentionDays: 365,
      statutory: false,
      description: 'Web push subscriptions retained while staff account is active.',
    },
  ];

  for (const rule of retentionDefaults) {
    // tenantId = null means platform-wide default.
    // Prisma unique index constraint name: uq_retention_tenant_category
    // We use upsert matching on the generated unique field — Prisma requires
    // undefined (not null) for optional fields in create, and uses a special
    // null-safe where for unique constraints with nullable fields.
    const existing = await prisma.retentionRule.findFirst({
      where: {
        tenantId: null,
        purposeCategory: rule.purposeCategory,
      },
    });

    if (existing) {
      await prisma.retentionRule.update({
        where: { id: existing.id },
        data: { retentionDays: rule.retentionDays },
      });
    } else {
      await prisma.retentionRule.create({
        data: {
          // tenantId intentionally omitted → defaults to NULL (platform-wide)
          purposeCategory: rule.purposeCategory,
          retentionDays: rule.retentionDays,
          statutory: rule.statutory,
          description: rule.description,
        },
      });
    }
  }
  console.log(`  ✓ ${retentionDefaults.length} retention rules seeded\n`);

  // ── 2. Pilot hotel tenant ────────────────────────────────────────────────────
  console.log('🏨 Seeding pilot hotel tenant...');

  const tenant = await prisma.tenant.upsert({
    where: { id: PILOT_HOTEL_ID },
    update: {},
    create: {
      id: PILOT_HOTEL_ID,
      name: 'The Grand Pilot Hotel',
      tenantType: 'HOTEL',
      config: {
        checkin_mode: 'AUTO_APPROVE', // guests check in without staff review
        dedup_rules: {
          match_any: ['booking_ref', 'full_name'],
        },
        wifi: {
          ssid: 'GrandHotel-Guest',
          credential: 'changeme-before-demo', // admin must update this in settings
        },
        call_rate_limit: {
          calls_per_hour: 10,
        },
        departments: ['RECEPTION', 'HOUSEKEEPING', 'ROOM_SERVICE'],
      },
    },
  });
  console.log(`  ✓ Tenant: ${tenant.name} (${tenant.id})\n`);

  // ── 3. Org unit hierarchy: Hotel → 3 departments ─────────────────────────────
  console.log('🏢 Seeding org unit hierarchy...');

  const rootOrg = await prisma.orgUnit.upsert({
    where: { id: PILOT_ORG_UNIT_ID },
    update: {},
    create: {
      id: PILOT_ORG_UNIT_ID,
      tenantId: PILOT_HOTEL_ID,
      parentId: null,
      name: 'The Grand Pilot Hotel',
      unitType: 'ORGANIZATION',
      metadata: {},
    },
  });

  const departments = [
    { id: DEPT_RECEPTION_ID, name: 'Reception', slug: 'RECEPTION' },
    { id: DEPT_HOUSEKEEPING_ID, name: 'Housekeeping', slug: 'HOUSEKEEPING' },
    { id: DEPT_ROOM_SERVICE_ID, name: 'Room Service', slug: 'ROOM_SERVICE' },
  ];

  for (const dept of departments) {
    await prisma.orgUnit.upsert({
      where: { id: dept.id },
      update: {},
      create: {
        id: dept.id,
        tenantId: PILOT_HOTEL_ID,
        parentId: rootOrg.id,
        name: dept.name,
        unitType: 'DEPARTMENT',
        metadata: { slug: dept.slug },
      },
    });
  }
  console.log(`  ✓ ${rootOrg.name} → [Reception, Housekeeping, Room Service]\n`);

  // ── 4. Staff identities ──────────────────────────────────────────────────────
  console.log('👤 Seeding staff identities...');

  const adminPasswordHash = await bcrypt.hash('Admin@123', BCRYPT_ROUNDS);
  const staffPasswordHash = await bcrypt.hash('Staff@123', BCRYPT_ROUNDS);

  const staffSeed = [
    {
      id: ADMIN_IDENTITY_ID,
      entityType: 'ADMIN' as const,
      email: 'admin@grandpilot.hotel',
      fullName: 'Hotel Administrator',
      passwordHash: adminPasswordHash,
      department: 'RECEPTION',
      designation: 'Hotel Administrator',
      orgUnitId: DEPT_RECEPTION_ID,
    },
    {
      id: STAFF_RECEPTION_ID,
      entityType: 'STAFF' as const,
      email: 'reception@grandpilot.hotel',
      fullName: 'Reception Staff',
      passwordHash: staffPasswordHash,
      department: 'RECEPTION',
      designation: 'Front Desk Officer',
      orgUnitId: DEPT_RECEPTION_ID,
    },
    {
      id: STAFF_HOUSEKEEPING_ID,
      entityType: 'STAFF' as const,
      email: 'housekeeping@grandpilot.hotel',
      fullName: 'Housekeeping Staff',
      passwordHash: staffPasswordHash,
      department: 'HOUSEKEEPING',
      designation: 'Housekeeping Officer',
      orgUnitId: DEPT_HOUSEKEEPING_ID,
    },
    {
      id: STAFF_ROOM_SERVICE_ID,
      entityType: 'STAFF' as const,
      email: 'roomservice@grandpilot.hotel',
      fullName: 'Room Service Staff',
      passwordHash: staffPasswordHash,
      department: 'ROOM_SERVICE',
      designation: 'Room Service Officer',
      orgUnitId: DEPT_ROOM_SERVICE_ID,
    },
  ];

  for (const s of staffSeed) {
    // Upsert identity record
    await prisma.identityRecord.upsert({
      where: { id: s.id },
      update: {},
      create: {
        id: s.id,
        tenantId: PILOT_HOTEL_ID,
        entityType: s.entityType,
        status: 'ACTIVE',
        registrationPath: 'A',
        profile: {
          full_name: s.fullName,
          email: s.email,
          password_hash: s.passwordHash,
          department: s.department,
        },
      },
    });

    // Upsert directory entry
    const existingEntry = await prisma.directoryEntry.findFirst({
      where: { identityId: s.id, orgUnitId: s.orgUnitId },
    });

    if (!existingEntry) {
      await prisma.directoryEntry.create({
        data: {
          tenantId: PILOT_HOTEL_ID,
          orgUnitId: s.orgUnitId,
          identityId: s.id,
          displayName: s.fullName,
          designation: s.designation,
          isActive: true,
        },
      });
    }

    console.log(`  ✓ ${s.entityType}: ${s.email}`);
  }

  console.log('\n✅ Seed complete!\n');
  console.log('─────────────────────────────────────────────');
  console.log('  Login credentials (dev only):');
  console.log('  Admin:        admin@grandpilot.hotel   / Admin@123');
  console.log('  Reception:    reception@grandpilot.hotel / Staff@123');
  console.log('  Housekeeping: housekeeping@grandpilot.hotel / Staff@123');
  console.log('  Room Service: roomservice@grandpilot.hotel / Staff@123');
  console.log('─────────────────────────────────────────────');
  console.log('  Guest OTP bypass (dev): 123456');
  console.log('─────────────────────────────────────────────\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
