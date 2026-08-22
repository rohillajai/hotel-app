# Design — Phase 1: Hotel Module
## In-App Check-In & WiFi-Based Voice Intercom Platform

**Version:** 1.0  
**Scope:** Phase 1 — Hotel Module only  
**Date:** 2026-08-22  
**Status:** Approved for implementation

---

## 1. System Overview

The platform is structured as a **generic core** with a **hotel-specific configuration and UI layer** on top. Every service described below is tenant-aware from day one — the hotel module drives it through a `tenant_type: 'HOTEL'` config, not by being the only consumer. This is the primary architectural constraint that governs all design decisions.

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT LAYER                          │
│  Guest PWA    Staff PWA    Admin Web Dashboard           │
│  (React/Next) (React/Next) (React/Next)                  │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS / WSS
┌────────────────────────▼────────────────────────────────┐
│                   API GATEWAY (NestJS)                   │
│         Auth Middleware · Rate Limiting · Tenant Guard   │
└──┬──────────┬──────────┬──────────┬──────────┬──────────┘
   │          │          │          │          │
┌──▼──┐  ┌───▼───┐  ┌───▼───┐  ┌───▼───┐  ┌───▼───┐
│ IAM │  │ Dir   │  │Access │  │Calling│  │Consent│
│Svc  │  │ Svc   │  │Control│  │Engine │  │& Ret. │
└──┬──┘  └───┬───┘  └───┬───┘  └───┬───┘  └───┬───┘
   │          │          │          │          │
┌──▼──────────▼──────────▼──────────▼──────────▼──────────┐
│              PostgreSQL (RDS ap-south-1)                  │
│         S3 (KYC) · S3 (General Docs) · ElastiCache       │
└─────────────────────────────────────────────────────────┘
                                    │
                         ┌──────────▼──────────┐
                         │  Signaling Server    │
                         │  (Socket.io/Node.js) │
                         └──────────┬──────────┘
                                    │ WebRTC ICE
                         ┌──────────▼──────────┐
                         │  coturn STUN/TURN    │
                         │  (EC2 t3.small)      │
                         └─────────────────────┘
```

---

## 2. Infrastructure & Hosting

### 2.1 AWS Architecture (ap-south-1)

| Component | Service | Spec (Pilot) | Notes |
|---|---|---|---|
| Frontend (PWA) | AWS Amplify Hosting | — | CI/CD from Git, CDN-backed |
| API Server | EC2 `t3.small` (or ECS Fargate) | 2 vCPU / 2 GB | NestJS app, horizontally scalable |
| Signaling Server | EC2 `t3.small` | Separate instance | Socket.io, long-lived WS connections |
| TURN Server | EC2 `t3.small` + Elastic IP | Dedicated instance | coturn, UDP 3478/49152-65535 open |
| Database | RDS PostgreSQL 15 `db.t3.micro` | 20 GB gp3 | Multi-AZ off for pilot, enable for prod |
| Cache / Sessions | ElastiCache Redis `cache.t3.micro` | — | Session store, rate-limit counters |
| KYC Document Store | S3 bucket (`-kyc-docs`) | Server-side AES-256 | Private, signed URLs only, 15 min expiry |
| General Doc Store | S3 bucket (`-app-assets`) | Server-side AES-256 | Separate bucket, separate lifecycle |
| Object Lifecycle | S3 Lifecycle Rules | Per retention category | Automated expiry enforcement |
| Push Notifications | AWS SNS | — | OTP delivery + Web Push |
| Secrets | AWS Secrets Manager | — | DB creds, JWT secrets, API keys |
| Logs | CloudWatch Logs | — | Structured JSON logs |

**Estimated pilot cost:** ~₹18,000–22,000/month (5 hotels, low traffic). Primary cost drivers: RDS + EC2 instances. Right-size down further by using RDS Serverless v2 if traffic is bursty.

### 2.2 coturn Configuration

Self-hosted coturn is the recommended choice at pilot scale (< 50 concurrent calls) because:
- Managed TURN services (Twilio NTS, Metered.ca) charge per minute — at scale this exceeds EC2 cost significantly
- Full control over credentials and logs
- Single `t3.small` handles ~50–80 concurrent TURN-relayed sessions comfortably

coturn is only used as relay when direct P2P or STUN fails (typically < 20% of calls on a properly configured hotel WiFi network). Most calls on the hotel LAN will be P2P.

Migration path: if the hotel's WiFi network is well-configured, TURN relay usage will be low. Monitor `coturn` metrics; migrate to managed if relay usage spikes unexpectedly.

---

## 3. Core Services Design

### 3.1 Identity & Onboarding Engine (`iam-service`)

This service is **tenant-agnostic**. The hotel module drives it through configuration, not custom code.

#### 3.1.1 Data Model

```sql
-- Tenant configuration
CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  tenant_type   VARCHAR(50)  NOT NULL,  -- 'HOTEL' | 'GOVT' | 'OFFICE'
  config        JSONB        NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- tenant.config for HOTEL type (example):
-- {
--   "checkin_mode": "STAFF_CONFIRM" | "AUTO_APPROVE",
--   "dedup_rules": { "match_any": ["booking_ref", "full_name"] },
--   "otp_bypass_enabled": false,
--   "departments": ["RECEPTION", "HOUSEKEEPING", "ROOM_SERVICE"]
-- }

-- Identity records (generic — works for guest, staff, govt user)
CREATE TABLE identity_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id),
  entity_type      VARCHAR(50) NOT NULL,  -- 'GUEST' | 'STAFF' | 'ADMIN'
  status           VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  -- PENDING | ACTIVE | REJECTED | MERGED | DEACTIVATED
  profile          JSONB       NOT NULL DEFAULT '{}',
  -- hotel guest: { full_name, mobile, booking_ref, room_number, check_in_dt, check_out_dt }
  -- staff:       { full_name, email, department, designation }
  dedup_hash       VARCHAR(64),           -- hash of matching-key values for fast lookup
  registration_path VARCHAR(10) NOT NULL, -- 'A' (admin-initiated) | 'B' (self-reg)
  created_by       UUID        REFERENCES identity_records(id),
  approved_by      UUID        REFERENCES identity_records(id),
  approved_at      TIMESTAMPTZ,
  merged_into      UUID        REFERENCES identity_records(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_identity_tenant_status ON identity_records(tenant_id, status);
CREATE INDEX idx_identity_dedup ON identity_records(tenant_id, dedup_hash);
```

#### 3.1.2 Deduplication Flow

```
Guest submits check-in form
        │
        ▼
Extract matching keys from tenant config (e.g., booking_ref, full_name)
        │
        ▼
Compute dedup_hash = SHA-256(tenant_id + sorted(key=value pairs))
        │
        ▼
Query: SELECT * FROM identity_records WHERE tenant_id = ? AND dedup_hash = ? AND status != 'REJECTED'
        │
   ┌────▼────┐
   │ Match?  │
   └────┬────┘
    No  │  Yes
        │    └──► Block creation
        │         Surface existing record to reviewer
        │         Options: MERGE (link new to existing) | REJECT (discard new submission)
        ▼
Create record with status = PENDING (Path B) or ACTIVE (Path A)
```

#### 3.1.3 Registration Paths

**Path A (Admin-initiated):** `POST /api/tenants/:tid/identities` with `registration_path: 'A'` — status set to `ACTIVE` immediately. Used for staff creation by admin.

**Path B (Self-registration):** `POST /api/tenants/:tid/identities/self-register` — status set to `PENDING`. Front-desk staff reviews and calls `POST /api/tenants/:tid/identities/:id/approve` or `/reject`.

---

### 3.2 Directory Service (`directory-service`)

#### 3.2.1 Data Model

```sql
-- Hierarchical org units (generic: Hotel > Department > ... or Ministry > Dept > ... )
CREATE TABLE org_units (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  parent_id   UUID        REFERENCES org_units(id),  -- NULL = root org
  name        VARCHAR(255) NOT NULL,
  unit_type   VARCHAR(50)  NOT NULL,  -- 'ORGANIZATION' | 'DEPARTMENT' | 'TEAM' | etc.
  metadata    JSONB        NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Directory entries (persons in the hierarchy)
CREATE TABLE directory_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id),
  org_unit_id     UUID        NOT NULL REFERENCES org_units(id),
  identity_id     UUID        NOT NULL REFERENCES identity_records(id),
  designation     VARCHAR(255),          -- 'Front Desk Officer', 'Joint Secretary', etc.
  display_name    VARCHAR(255) NOT NULL,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Full-text search index on both name and designation
CREATE INDEX idx_dir_search ON directory_entries
  USING GIN (to_tsvector('english', display_name || ' ' || COALESCE(designation, '')));
CREATE INDEX idx_dir_org_unit ON directory_entries(org_unit_id, is_active);
```

#### 3.2.2 Search

The search index on `(display_name, designation)` is built now but the designation-based search endpoint is marked `@internal` and not exposed in the Phase 1 public API. Phase 2 can expose it without a schema migration.

Phase 1 search: `GET /api/directory/search?q=<name>&tenant_id=<tid>` — name-only results.

---

### 3.3 Access Control / Time-Boxed Grant Engine (`access-service`)

#### 3.3.1 Data Model

```sql
CREATE TABLE access_grants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id),
  subject_id      UUID        NOT NULL REFERENCES identity_records(id),
  grant_type      VARCHAR(50) NOT NULL,  -- 'HOTEL_STAY' | 'STAFF_ROLE' | 'GOVT_USER' (future)
  privileges      TEXT[]      NOT NULL,  -- ['CALLING', 'WIFI', 'SERVICE_REQUEST']
  valid_from      TIMESTAMPTZ NOT NULL,
  valid_until     TIMESTAMPTZ,           -- NULL = indefinite (Phase 2 govt/office)
  status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  -- ACTIVE | REVOKED | EXPIRED | SUSPENDED
  calling_restricted BOOLEAN  NOT NULL DEFAULT FALSE,
  revoked_at      TIMESTAMPTZ,
  revoked_by      UUID        REFERENCES identity_records(id),
  revoke_reason   VARCHAR(255),
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_grant_subject ON access_grants(subject_id, status);
CREATE INDEX idx_grant_expiry  ON access_grants(valid_until, status)
  WHERE valid_until IS NOT NULL;  -- partial index — only time-boxed grants

-- WiFi voucher linked to grant
CREATE TABLE wifi_vouchers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id    UUID        NOT NULL REFERENCES access_grants(id),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  ssid        VARCHAR(255) NOT NULL,
  credential  VARCHAR(255) NOT NULL,  -- encrypted at rest
  status      VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | REVOKED | EXPIRED
  external_id VARCHAR(255),           -- controller-assigned voucher ID (future)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 3.3.2 Grant Lifecycle

```
Check-in Approved
      │
      ▼
access-service.issueGrant(subject_id, 'HOTEL_STAY', valid_from, valid_until)
      │
      ├──► wifi-adapter.provisionVoucher(grant_id) → wifi_vouchers row
      │
      └──► notify subject via Web Push (PWA session activated)

Checkout (scheduled OR manual)
      │
      ▼
access-service.revokeGrant(grant_id, reason, revoked_by)
      │
      ├──► wifi-adapter.revokeVoucher(voucher_id)
      ├──► auth-service.invalidateAllSessions(subject_id)
      └──► emit 'grant.revoked' event (for future subscribers)
```

**Expiry job:** Runs every 5 minutes. Queries `access_grants WHERE valid_until <= NOW() AND status = 'ACTIVE'`. Calls `revokeGrant` for each. This is idempotent.

---

### 3.4 Calling Engine (`calling-service` + `signaling-server`)

#### 3.4.1 Components

| Component | Technology | Responsibility |
|---|---|---|
| `signaling-server` | Node.js + Socket.io | Call setup, routing, room management |
| `coturn` | Self-hosted EC2 | STUN + TURN relay |
| `calling-service` | NestJS module | Call metadata logging, rate limiting, abuse |
| WebRTC (client) | Browser native API | Audio peer connection |

#### 3.4.2 Call Flow

```
Guest PWA                 Signaling Server              Staff PWA
    │                           │                           │
    │── connect(token) ────────►│                           │
    │                           │◄─── connect(token) ───────│
    │                           │                           │
    │── call.initiate ──────────►│                           │
    │   { to: 'RECEPTION',      │                           │
    │     room: '201' }         │                           │
    │                           │── call.incoming ─────────►│
    │                           │   { from_room: '201',     │
    │                           │     call_id: uuid }       │
    │                           │                           │
    │                           │◄── call.accept ───────────│
    │◄── call.accepted ─────────│                           │
    │                           │                           │
    │◄════════ WebRTC SDP / ICE exchange (via signaling) ══►│
    │                           │                           │
    │◄════════════════ P2P Audio (direct or TURN) ═════════►│
    │                           │                           │
    │── call.end ──────────────►│── call.end ──────────────►│
    │                           │                           │
    │                    calling-service                     │
    │                    LOG metadata only                   │
```

#### 3.4.3 Signaling Authentication

Every Socket.io connection requires a valid JWT in the handshake. The signaling server validates the token and extracts `{ subject_id, tenant_id, room_number, entity_type }`. Staff connections also carry `{ department }`.

The signaling server never routes a call if the caller's grant is not `ACTIVE` or if `calling_restricted = TRUE`. It queries `access-service` on each `call.initiate` event (cached in Redis, 30-second TTL).

#### 3.4.4 Call Metadata Schema

```sql
CREATE TABLE call_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id),
  caller_id       UUID        NOT NULL REFERENCES identity_records(id),
  callee_dept     VARCHAR(50),          -- 'RECEPTION' | 'HOUSEKEEPING' | 'ROOM_SERVICE'
  callee_id       UUID        REFERENCES identity_records(id),  -- NULL until accepted
  room_identifier VARCHAR(50),          -- room number shown to staff (NOT phone number)
  call_id         UUID        NOT NULL,
  initiated_at    TIMESTAMPTZ NOT NULL,
  answered_at     TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  duration_secs   INTEGER,
  outcome         VARCHAR(30),          -- 'ANSWERED' | 'MISSED' | 'REJECTED' | 'FAILED'
  turn_relayed    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE abuse_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id),
  reported_by UUID        NOT NULL REFERENCES identity_records(id),
  subject_id  UUID        NOT NULL REFERENCES identity_records(id),
  call_id     UUID,
  reason      TEXT        NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'OPEN',  -- OPEN | REVIEWED | ACTIONED
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 3.4.5 Rate Limiting

Implemented in Redis. Key: `ratelimit:call:{subject_id}`. Sliding window counter, 10-call limit per 60-minute window (configurable per tenant in `tenants.config`). Checked by the signaling server before forwarding `call.initiate`.

#### 3.4.6 Web Push (PWA Incoming Calls)

Since the pilot uses a PWA (no CallKit), incoming calls are surfaced via:
1. Web Push notification (via AWS SNS + VAPID) — wakes the browser tab
2. In-app call screen appears if PWA is open in background
3. Staff PWA must be kept open or installed as PWA (Add to Home Screen) for reliable push

**CallKit/PushKit stub:** An interface `ICallWakeStrategy` is defined with two implementations: `WebPushStrategy` (Phase 1) and `CallKitStrategy` (stub, Phase 2+). The signaling server picks the strategy based on the client's registered device type.

---

### 3.5 Consent & Retention Engine (`retention-service`)

#### 3.5.1 Data Model

```sql
-- Configurable retention rules (not hardcoded)
CREATE TABLE retention_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        REFERENCES tenants(id),  -- NULL = platform default
  purpose_category VARCHAR(50) NOT NULL,
  -- 'KYC_DOCUMENT' | 'BOOKING_PROFILE' | 'CALL_METADATA' | 'SERVICE_REQUEST'
  retention_days   INTEGER     NOT NULL,
  statutory        BOOLEAN     NOT NULL DEFAULT FALSE,
  -- TRUE = cannot be overridden by guest deletion request
  description      TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Data subject records (tracks what data exists per subject per purpose)
CREATE TABLE data_subject_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id       UUID        NOT NULL REFERENCES identity_records(id),
  purpose_category VARCHAR(50) NOT NULL,
  data_ref         VARCHAR(500) NOT NULL,  -- S3 key or DB row reference
  expires_at       TIMESTAMPTZ,
  erased_at        TIMESTAMPTZ,
  erasure_blocked  BOOLEAN     NOT NULL DEFAULT FALSE,
  -- TRUE if statutory rule prevents erasure
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dsr_expiry ON data_subject_records(expires_at)
  WHERE erased_at IS NULL;
```

#### 3.5.2 Erasure Job

Scheduled: every night at 02:00 IST.

```
1. SELECT * FROM data_subject_records
   WHERE expires_at <= NOW() AND erased_at IS NULL AND erasure_blocked = FALSE

2. For each record:
   a. If data_ref is an S3 key → delete S3 object
   b. If data_ref is a DB ref → anonymize/nullify the identified fields (not hard-delete row)
   c. Mark erased_at = NOW()
   d. Log erasure event to audit log

3. Guest deletion request override:
   - Mark erasure_blocked = TRUE for records where a statutory retention_rule applies
   - Return a notice to the guest: "Certain data is retained for [N] days per law [reference]"
```

---

### 3.6 Service Requests (`service-request-service`)

```sql
CREATE TABLE service_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id),
  guest_id        UUID        NOT NULL REFERENCES identity_records(id),
  department      VARCHAR(50) NOT NULL,  -- 'HOUSEKEEPING' | 'ROOM_SERVICE'
  category        VARCHAR(50) NOT NULL,  -- 'LAUNDRY' | 'FOOD_ORDER' | etc.
  details         JSONB       NOT NULL DEFAULT '{}',
  status          VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED',
  -- SUBMITTED | IN_PROGRESS | COMPLETED | CANCELLED
  assigned_to     UUID        REFERENCES identity_records(id),
  room_identifier VARCHAR(50) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Real-time status updates pushed to the guest PWA via Socket.io (same signaling server, separate namespace `/service`).

---

### 3.7 Authentication Service (`auth-service`)

#### 3.7.1 Guest Auth (OTP)

```
POST /auth/guest/otp/send   { mobile }
  → rate check (5 attempts / 10 min, Redis)
  → generate 6-digit OTP
  → if NODE_ENV !== 'production': store '123456', skip SNS call
  → if NODE_ENV === 'production': send via AWS SNS, store hashed OTP (bcrypt)
  → TTL: 10 minutes

POST /auth/guest/otp/verify { mobile, otp }
  → verify OTP
  → lookup or create identity_record for mobile
  → issue JWT access token (15 min) + refresh token (7 days, stored in DB)
  → return { access_token, refresh_token, identity_id }
```

#### 3.7.2 Staff/Admin Auth (Email + Password)

```
POST /auth/staff/login { email, password }
  → lookup identity_record by email
  → bcrypt.compare(password, stored_hash)  -- cost factor 12
  → issue JWT + refresh token
```

#### 3.7.3 Token Structure

```json
{
  "sub": "<identity_id>",
  "tenant_id": "<tenant_id>",
  "entity_type": "GUEST | STAFF | ADMIN",
  "room": "<room_number>",
  "grants": ["CALLING", "WIFI"],
  "iat": 1234567890,
  "exp": 1234568790
}
```

#### 3.7.4 Session Invalidation on Grant Revocation

Refresh tokens are stored in a `refresh_tokens` table with `revoked_at`. On `revokeGrant`, the access service calls `auth-service.revokeAllTokensForSubject(subject_id)`. All existing refresh tokens for that subject are marked revoked. Next refresh attempt returns `401`, forcing a logout.

---

### 3.8 WiFi Adapter Interface

```typescript
// packages/core/src/wifi/wifi-adapter.interface.ts

export interface WifiVoucherRequest {
  grantId: string;
  subjectId: string;
  tenantId: string;
  validFrom: Date;
  validUntil: Date;
  roomIdentifier: string;
}

export interface WifiVoucherResult {
  ssid: string;
  credential: string;
  externalId?: string;  // controller-assigned ID for revocation
}

export interface IWifiAdapter {
  provisionVoucher(req: WifiVoucherRequest): Promise<WifiVoucherResult>;
  revokeVoucher(externalId: string): Promise<void>;
  isAvailable(): Promise<boolean>;
}

// Phase 1 implementation: StaticCredentialAdapter
// Returns SSID + password configured in hotel settings.
// Future: UnifiAdapter, MerakiAdapter, RuckusAdapter
```

---

### 3.9 PMS Adapter Interface

```typescript
// packages/core/src/pms/pms-adapter.interface.ts

export interface BookingLookupRequest {
  bookingRef: string;
  guestName?: string;
  tenantId: string;
}

export interface BookingRecord {
  bookingRef: string;
  guestName: string;
  roomNumber: string;
  checkInDate: Date;
  checkOutDate: Date;
  status: 'CONFIRMED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED';
}

export interface IPmsAdapter {
  lookupBooking(req: BookingLookupRequest): Promise<BookingRecord | null>;
  isAvailable(): Promise<boolean>;
}

// Phase 1 implementation: ManualEntryAdapter
// Always returns null (no PMS); staff manually verifies booking ref.
// Future: EzeeAdapter, StayflexiAdapter, HotelogixAdapter, IdsNextAdapter
```

---

## 4. Frontend Architecture

### 4.1 Applications

| App | Framework | Path | Audience |
|---|---|---|---|
| Guest PWA | Next.js (App Router) | `/apps/guest-pwa` | Hotel guests |
| Admin Web | Next.js (App Router) | `/apps/admin-web` | Hotel admin + front desk |
| Staff PWA | Next.js (App Router) | `/apps/staff-pwa` | Hotel department staff |

All three share a `packages/ui` component library and `packages/api-client` (typed API wrappers using `@tanstack/react-query`).

### 4.2 Guest PWA — Page Flow

```
/                     Landing (hotel branding + "Check In" CTA)
/checkin              Step 1: Enter booking ref + name
/checkin/verify       Step 2: OTP verification
/checkin/upload       Step 3: ID document upload
/checkin/pending      Waiting for staff approval (mode B)
/dashboard            Home (call buttons, service requests, WiFi info)
/call/:department     Active call screen (WebRTC)
/requests             Service request history
/requests/new         New service request form
```

### 4.3 Staff PWA — Page Flow

```
/login                Email + password
/dashboard            Incoming call alerts + service request queue
/call                 Active call screen (shows guest room number)
/requests             Service requests (filter by department)
/requests/:id         Request detail + status update
```

### 4.4 Admin Web — Page Flow

```
/login                Email + password
/dashboard            Overview (active guests, pending check-ins)
/checkin              Pending approvals queue + dedup review
/guests               Guest list (active, checked out)
/guests/:id           Guest detail + grant status + early checkout
/staff                Staff directory
/staff/new            Add staff member
/calls                Call metadata log (search/filter)
/abuse-reports        Flagged reports + restrict calling action
/settings             Hotel config (check-in mode, WiFi, OTP)
```

---

## 5. Repository Structure (Monorepo)

```
hotel-app/
├── apps/
│   ├── guest-pwa/          # Next.js — guest check-in + dashboard
│   ├── staff-pwa/          # Next.js — staff call/requests
│   ├── admin-web/          # Next.js — admin dashboard
│   ├── api-server/         # NestJS — main API
│   └── signaling-server/   # Node.js + Socket.io — WebRTC signaling
├── packages/
│   ├── core/               # Shared business logic, interfaces (adapters, DTOs)
│   ├── ui/                 # Shared React component library
│   ├── api-client/         # Typed API wrappers (react-query)
│   ├── db/                 # Prisma schema + migrations
│   └── config/             # Shared config/env validation (zod)
├── infra/
│   ├── terraform/          # AWS resource definitions
│   ├── coturn/             # coturn config + EC2 setup scripts
│   └── docker/             # Compose for local dev
├── .kiro/
│   └── specs/              # This document
└── package.json            # Turborepo workspace root
```

---

## 6. Security Design

| Concern | Approach |
|---|---|
| API auth | JWT Bearer, validated on every request via NestJS guard |
| S3 documents | Private bucket, pre-signed URLs (15 min), no public ACL |
| OTP brute force | Redis rate limit: 5 attempts / 10 min per mobile |
| Call routing | Signaling server validates grant on every `call.initiate` |
| Secrets | AWS Secrets Manager — no secrets in env files or git |
| DB connections | Connection via IAM role (RDS IAM auth) for app server |
| TURN credentials | Time-limited TURN credentials (RFC 5766), not static |
| Input validation | `class-validator` on all DTOs; Zod on frontend forms |
| SQL injection | Prisma ORM parameterized queries only, no raw SQL in app code |
| CORS | Strict origin whitelist per environment |
| HTTPS | TLS 1.2+ enforced; HSTS header |
| Audit log | Immutable append-only table for all grant/identity state changes |

---

## 7. Phase 2 Forward-Compatibility

> This section documents design decisions made in Phase 1 **specifically** to avoid breaking changes when Phase 2 (Government/Ministry) is built. Nothing in this section is built now.

### 7.1 Identity & Onboarding Engine
- `identity_records.profile` is `JSONB` — Phase 2 govt user fields (employee ID, designation, ministry) fit without a schema migration.
- `registration_path` enum ('A' / 'B') already models both nodal-officer-initiated and self-registration paths.
- `dedup_rules` in tenant config is pluggable — Phase 2 will set `{ match_any: ["employee_id", "mobile"] }` without touching core code.

### 7.2 Directory Service
- `org_units.parent_id` is recursive — `Ministry → Department → Nodal Officer → User` is a 4-level hierarchy that fits the existing adjacency list.
- `directory_entries.designation` field and GIN search index are built now — Phase 2's "search by designation" feature requires zero schema changes.

### 7.3 Access Control
- `access_grants.valid_until` is nullable — indefinite role-based grants (Phase 2) simply leave this NULL.
- `access_grants.grant_type` is a free-text discriminator — `'GOVT_USER'` is a new value, not a migration.
- Expiry job uses a partial index on `valid_until IS NOT NULL` — indefinite grants never touch the expiry query.

### 7.4 Calling Engine
- `ICallWakeStrategy` interface means CallKit support (Phase 2 native app) is a new implementation, not a refactor.
- Signaling server is tenant-aware from day one — routing rules per tenant are config-driven.

### 7.5 Tenant Config
- `tenants.config JSONB` stores all tenant-specific overrides. Phase 2 adds new keys without touching the schema.

### 7.6 Known Limitations to Address Before Phase 2
- `call_logs.callee_dept` is currently a VARCHAR enum for hotel departments. Phase 2 will route calls to specific persons (not departments). The signaling server will need a routing-strategy abstraction (`DepartmentRoundRobin` for Phase 1, `DirectoryLookup` for Phase 2). **Flag:** Design the routing strategy as an interface now, even though only one implementation is built.

---

## 8. API Design Conventions

- Base URL: `https://api.<domain>/v1`
- All endpoints require `X-Tenant-ID` header (or derived from JWT claim)
- Error format: `{ code: string, message: string, details?: object }`
- Pagination: cursor-based (`?cursor=<id>&limit=<n>`)
- Timestamps: ISO 8601, UTC
- File uploads: multipart/form-data to `/uploads`, returns S3 signed URL
- WebSocket: `wss://signal.<domain>` (separate subdomain from API)

---

## 9. Local Development

```bash
# Prerequisites: Docker, Node.js 20+, pnpm

# Start all services
docker compose -f infra/docker/docker-compose.yml up -d
# Starts: PostgreSQL, Redis, coturn (local), MinIO (S3 substitute)

pnpm install
pnpm run dev
# Starts: api-server (:3001), signaling-server (:3002),
#         guest-pwa (:3000), staff-pwa (:3003), admin-web (:3004)

# OTP in dev: always '123456' (NODE_ENV=development)
# S3 in dev: MinIO at localhost:9000
```
