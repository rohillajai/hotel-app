# Tasks — Phase 1: Hotel Module
## In-App Check-In & WiFi-Based Voice Intercom Platform

**Version:** 1.0  
**Date:** 2026-08-22  
**Status:** Ready for implementation  
**Prerequisites:** requirements.md and design.md approved

---

## How to Read This File

- Tasks are ordered by dependency — earlier tasks are prerequisites for later ones.
- Each task has a **Milestone** tag so you can track progress at a coarse level.
- Tasks marked `[INTERFACE ONLY]` produce no running code — they define contracts used by later tasks.
- Tasks marked `[STUB]` produce placeholder implementations that satisfy the interface; the concrete implementation is deferred.
- A task is **done** when: code is written, it compiles without errors, and the specified acceptance criteria pass locally.

---

## Milestones

| # | Milestone | What it unlocks |
|---|---|---|
| M1 | Repo & Infrastructure Scaffold | Everything else |
| M2 | Core Data Layer | All services |
| M3 | Auth & Identity | Check-in flow, calling |
| M4 | Access Control & Grant Engine | WiFi provisioning, session revocation |
| M5 | Directory Service | Call routing |
| M6 | Calling Engine | Guest + staff call UI |
| M7 | Guest Check-In Flow (PWA) | End-to-end guest journey |
| M8 | Staff PWA | Staff-side of calling + requests |
| M9 | Admin Web Dashboard | Hotel operations |
| M10 | Service Requests | Guest service features |
| M11 | Retention & Compliance | DPDP compliance |
| M12 | Infra & Deployment | Production-ready |

---

## M1 — Repo & Infrastructure Scaffold

### Task 1.1 — Initialize monorepo
**Description:** Set up a Turborepo monorepo with pnpm workspaces.

**Steps:**
1. Init repo at workspace root with `pnpm init` and `turbo init`
2. Create workspace structure:
   ```
   apps/guest-pwa, apps/staff-pwa, apps/admin-web,
   apps/api-server, apps/signaling-server,
   packages/core, packages/ui, packages/db, packages/api-client, packages/config
   ```
3. Configure `turbo.json` with pipelines: `build`, `dev`, `lint`, `test`
4. Configure root `package.json` with workspace globs
5. Add `.gitignore`, `.nvmrc` (Node 20), `prettier.config.js`, `eslint.config.js`

**Acceptance:** `pnpm install` succeeds; `pnpm run build` from root runs all app builds (empty at this stage but no errors).

---

### Task 1.2 — Docker Compose for local development
**Description:** Create `infra/docker/docker-compose.yml` for all local dependencies.

**Services to include:**
- `postgres` — PostgreSQL 15, port 5432, persistent volume
- `redis` — Redis 7, port 6379
- `minio` — S3-compatible local storage, ports 9000 (API) + 9001 (console)
- `coturn` — TURN server for local WebRTC testing, ports 3478/udp + 49152-65535/udp

**Steps:**
1. Write `docker-compose.yml` with health checks on all services
2. Write `infra/docker/.env.example` with all required variables
3. Write `infra/docker/coturn/turnserver.conf` (local dev config, static auth credentials)
4. Add `pnpm run infra:up` and `pnpm run infra:down` scripts to root `package.json`

**Acceptance:** `docker compose up -d` starts all four services healthy; MinIO console accessible at `localhost:9001`.

---

### Task 1.3 — Shared config & environment validation (`packages/config`)
**Description:** Create a shared config package using Zod for environment variable validation.

**Steps:**
1. Define `AppConfig` schema with Zod covering:
   - `NODE_ENV`, `PORT`
   - `DATABASE_URL`, `REDIS_URL`
   - `JWT_SECRET`, `JWT_REFRESH_SECRET`
   - `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
   - `S3_KYC_BUCKET`, `S3_ASSETS_BUCKET`
   - `SNS_OTP_TOPIC_ARN`
   - `COTURN_HOST`, `COTURN_PORT`, `COTURN_SECRET`
   - `OTP_BYPASS_ENABLED` (boolean, default false, blocked in production)
2. Export a `loadConfig()` function that validates and returns typed config
3. Export `.env.example` template

**Acceptance:** `loadConfig()` throws a descriptive error if any required variable is missing; `OTP_BYPASS_ENABLED=true` when `NODE_ENV=production` throws an explicit error.

---

### Task 1.4 — Prisma schema (`packages/db`)
**Description:** Write the complete Prisma schema covering all tables from design.md §3.

**Tables to define (match design.md exactly):**
- `tenants`
- `identity_records`
- `org_units`
- `directory_entries`
- `access_grants`
- `wifi_vouchers`
- `call_logs`
- `abuse_reports`
- `service_requests`
- `refresh_tokens`
- `retention_rules`
- `data_subject_records`
- `audit_log` (append-only: `id, tenant_id, actor_id, action, entity_type, entity_id, before JSONB, after JSONB, created_at`)

**Steps:**
1. Write `packages/db/prisma/schema.prisma` with all models
2. Add all indexes specified in design.md (including GIN index for directory search — use raw SQL in migration for GIN)
3. Write initial migration: `pnpm prisma migrate dev --name init`
4. Export `PrismaClient` as a singleton from `packages/db/src/index.ts`
5. Add seed script `packages/db/prisma/seed.ts`: creates one test tenant (hotel), one admin user, three org_units (Reception, Housekeeping, Room Service)

**Acceptance:** `pnpm prisma migrate dev` runs cleanly; `pnpm prisma db seed` populates seed data; Prisma Studio shows all tables.

---

## M2 — Core Interfaces & Adapters

### Task 2.1 — Adapter interfaces (`packages/core`) `[INTERFACE ONLY]`
**Description:** Define all pluggable adapter interfaces in `packages/core`.

**Interfaces to write (TypeScript):**
1. `IWifiAdapter` — from design.md §3.8
2. `IPmsAdapter` — from design.md §3.9
3. `ICallWakeStrategy` — two methods: `sendIncomingCallNotification(payload)`, `getStrategyType()`
4. `IIdentityMatchingRule` — method: `computeDedupHash(profile: object, keys: string[]): string`
5. `INotificationAdapter` — method: `sendOtp(mobile: string, otp: string): Promise<void>`

**Steps:**
1. Create `packages/core/src/interfaces/` directory with one file per interface
2. Export all interfaces from `packages/core/src/index.ts`
3. Add JSDoc on each interface explaining Phase 2 extension points

**Acceptance:** TypeScript compiles with zero errors; all interfaces exported from package root.

---

### Task 2.2 — Stub adapter implementations (`packages/core`) `[STUB]`
**Description:** Create stub implementations for all adapters that will be wired into Phase 1.

**Implementations:**
1. `StaticCredentialWifiAdapter implements IWifiAdapter` — returns SSID + password from hotel config; `revokeVoucher` is a no-op
2. `ManualEntryPmsAdapter implements IPmsAdapter` — `lookupBooking` always returns `null`; `isAvailable` returns `false`
3. `WebPushCallWakeStrategy implements ICallWakeStrategy` — sends Web Push via AWS SNS; stub body logs "Web Push sent" for now (real implementation in Task 6.4)
4. `CallKitCallWakeStrategy implements ICallWakeStrategy` — stub only; throws `NotImplementedError`
5. `SnsNotificationAdapter implements INotificationAdapter` — sends OTP via AWS SNS; if `OTP_BYPASS_ENABLED` returns without calling SNS
6. `DefaultIdentityMatchingRule implements IIdentityMatchingRule` — SHA-256 of sorted key=value pairs

**Acceptance:** Each stub compiles; unit tests (one per adapter) verify the stub contract is met.

---

## M3 — Authentication Service

### Task 3.1 — NestJS API server scaffold (`apps/api-server`)
**Description:** Bootstrap the NestJS application with core modules.

**Steps:**
1. Create NestJS app with `@nestjs/cli`
2. Install and configure:
   - `@nestjs/config` (uses `packages/config`)
   - `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`
   - `@nestjs/throttler` (rate limiting)
   - `@prisma/client` (from `packages/db`)
   - `ioredis` for Redis connection
   - `class-validator`, `class-transformer`
3. Create `AppModule` importing: `ConfigModule`, `DatabaseModule`, `RedisModule`, `ThrottlerModule`
4. Set up global pipes: `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`
5. Set up global exception filter returning standard error format
6. Health check endpoint: `GET /health` → `{ status: 'ok', timestamp }`

**Acceptance:** `pnpm run dev` (api-server) starts on port 3001; `/health` returns 200.

---

### Task 3.2 — Guest OTP authentication
**Description:** Implement phone OTP flow for guests.

**Endpoints:**
- `POST /v1/auth/guest/otp/send` — body: `{ mobile: string }`
- `POST /v1/auth/guest/otp/verify` — body: `{ mobile: string, otp: string }`
- `POST /v1/auth/refresh` — body: `{ refresh_token: string }`
- `POST /v1/auth/logout` — (authenticated) revokes current refresh token

**Steps:**
1. Create `AuthModule` with `GuestAuthService`
2. `sendOtp`: validate mobile (E.164 format), check rate limit (5/10min via Redis), generate 6-digit OTP, store hashed OTP in Redis with 10-min TTL, call `INotificationAdapter.sendOtp()`
3. `verifyOtp`: retrieve and verify OTP from Redis, clear OTP entry on success, upsert `identity_record` with `entity_type: 'GUEST'`, issue JWT access token (15 min) + refresh token (store in `refresh_tokens` table, 7-day expiry)
4. `refresh`: validate refresh token from DB, ensure `revoked_at IS NULL`, issue new access token
5. `logout`: set `revoked_at = NOW()` on current refresh token
6. JWT payload: `{ sub, tenant_id, entity_type, room, grants }`

**Acceptance:**
- `POST /v1/auth/guest/otp/send` with valid mobile returns `{ message: 'OTP sent' }`
- In dev: `POST /v1/auth/guest/otp/verify` with `otp: '123456'` returns valid JWT
- 6th OTP send attempt within 10 min returns 429
- Invalid OTP returns 401

---

### Task 3.3 — Staff/Admin email+password authentication
**Description:** Implement email + password auth for staff and admin.

**Endpoints:**
- `POST /v1/auth/staff/login` — body: `{ email: string, password: string }`
- `POST /v1/auth/staff/logout` — (authenticated)

**Steps:**
1. Extend `AuthModule` with `StaffAuthService`
2. `login`: look up `identity_record` by `profile->>'email'`, compare password with `bcrypt.compare()` (cost 12), issue JWT + refresh token
3. Implement `JwtAuthGuard` (Passport strategy) and `RolesGuard` checking `entity_type` from JWT
4. Create decorators: `@CurrentUser()`, `@Roles('ADMIN', 'STAFF', 'GUEST')`, `@TenantId()`

**Acceptance:**
- Valid credentials return JWT; wrong password returns 401
- Protected endpoint with `@Roles('ADMIN')` rejects GUEST token with 403

---

### Task 3.4 — Tenant guard & multi-tenancy middleware
**Description:** Ensure every authenticated request is scoped to the correct tenant.

**Steps:**
1. Create `TenantGuard` that reads `tenant_id` from JWT and validates it exists in `tenants` table (cached in Redis, 5-min TTL)
2. Create `TenantContext` request-scoped provider that makes `tenant_id` available to all services without passing it through every function call
3. Apply `TenantGuard` globally after `JwtAuthGuard`

**Acceptance:** Request with a JWT from tenant A cannot access data from tenant B (verified by test with two seed tenants).

---

## M4 — Identity & Onboarding Service

### Task 4.1 — Identity service core
**Description:** Implement the tenant-agnostic identity record CRUD and deduplication engine.

**Endpoints:**
- `POST /v1/identities` — create identity record (admin/staff use; Path A)
- `POST /v1/identities/self-register` — guest self-registration (Path B)
- `GET /v1/identities/:id` — get identity record (staff/admin)
- `PATCH /v1/identities/:id/approve` — approve pending record
- `PATCH /v1/identities/:id/reject` — reject pending record
- `PATCH /v1/identities/:id/merge` — merge duplicate into existing

**Steps:**
1. Create `IdentityModule` with `IdentityService`
2. Implement `computeDedupHash(profile, tenantMatchingKeys)` using `DefaultIdentityMatchingRule`
3. Before any `create`: compute hash, query for existing records, if match found return `409 CONFLICT` with existing record in response body
4. Path A: set `status = ACTIVE`, `registration_path = 'A'`, `created_by = requesting staff id`
5. Path B: set `status = PENDING`, `registration_path = 'B'`
6. `approve`: set `status = ACTIVE`, `approved_by`, `approved_at = NOW()` → trigger `AccessService.issueGrant()`
7. `reject`: set `status = REJECTED`
8. `merge`: set `merged_into` on the new record; the old record remains `ACTIVE`
9. Write audit log entry on every status change

**Acceptance:**
- Self-registering the same booking_ref twice returns 409 with existing record
- Approving a pending record triggers grant issuance (stub grant for now, real in M5)
- All state transitions written to `audit_log`

---

### Task 4.2 — Document upload for KYC
**Description:** Implement ID document upload to the KYC S3 bucket.

**Endpoints:**
- `POST /v1/identities/:id/documents` — upload ID document (multipart/form-data)
- `GET /v1/identities/:id/documents/:doc_id/url` — get short-lived signed URL (staff/admin only)

**Steps:**
1. Accept JPEG/PNG/PDF, max 5 MB, validate MIME type server-side
2. Generate S3 key: `kyc/{tenant_id}/{identity_id}/{uuid}.{ext}` in the KYC bucket
3. Upload to S3 with `ServerSideEncryption: 'AES256'`
4. Store `data_subject_records` row with `purpose_category: 'KYC_DOCUMENT'`, `data_ref = s3_key`, `expires_at = NOW() + retention_rule.retention_days`
5. Signed URL generation: 15-min expiry, `GET` method only
6. Guests can upload their own documents; only staff/admin can retrieve signed URLs

**Acceptance:**
- Upload returns S3 key (not URL); direct S3 URL is not accessible (bucket is private)
- Signed URL works for 15 min; returns 403 after expiry
- Files > 5 MB rejected with 413

---

## M5 — Access Control & Grant Engine

### Task 5.1 — Grant issuance and revocation
**Description:** Implement the core access grant lifecycle.

**Endpoints:**
- `POST /v1/grants` — issue grant (internal, called by identity service on approval)
- `GET /v1/grants/:id` — get grant details
- `PATCH /v1/grants/:id/revoke` — revoke grant (staff/admin; immediate)
- `PATCH /v1/grants/:id/restrict-calling` — set `calling_restricted = TRUE` without full revocation
- `GET /v1/guests/:identity_id/grant` — get active grant for a guest (staff/admin)

**Steps:**
1. Create `AccessModule` with `AccessService`
2. `issueGrant(subjectId, grantType, validFrom, validUntil, privileges)`:
   - Insert `access_grants` row
   - Call `WifiAdapter.provisionVoucher()` → insert `wifi_vouchers` row
   - Emit internal event `grant.issued`
3. `revokeGrant(grantId, reason, revokedBy)`:
   - Set `status = REVOKED`, `revoked_at = NOW()`
   - Call `WifiAdapter.revokeVoucher()`
   - Call `AuthService.revokeAllTokensForSubject(subjectId)`
   - Emit internal event `grant.revoked`
   - Write audit log entry
4. `checkPrivilege(subjectId, privilege)`: returns boolean (used by signaling server); cache result in Redis (30-sec TTL); invalidate cache on revocation

**Acceptance:**
- Issuing a grant creates both `access_grants` and `wifi_vouchers` rows
- Revoking a grant: associated refresh tokens are marked revoked; subsequent auth refresh returns 401
- `checkPrivilege` returns false immediately after revocation (cache invalidated)

---

### Task 5.2 — Grant expiry background job
**Description:** Scheduled job to auto-expire time-boxed grants.

**Steps:**
1. Use `@nestjs/schedule` with a cron job running every 5 minutes
2. Query: `SELECT * FROM access_grants WHERE valid_until <= NOW() AND status = 'ACTIVE'`
3. For each result: call `AccessService.revokeGrant(id, 'SCHEDULED_EXPIRY', null)`
4. Log count of expired grants per run to CloudWatch (structured log)
5. Ensure job is idempotent (safe to run concurrently if two instances start simultaneously — use DB-level advisory lock or `UPDATE ... WHERE status = 'ACTIVE' RETURNING *` pattern)

**Acceptance:**
- A grant with `valid_until = NOW() - 1 minute` is revoked within the next job run
- Running the job twice simultaneously does not double-revoke (no errors, idempotent)

---

## M6 — Directory Service

### Task 6.1 — Org unit and directory CRUD
**Description:** Implement the hierarchical directory service.

**Endpoints:**
- `GET /v1/directory/units` — list org units for tenant (tree structure)
- `POST /v1/directory/units` — create org unit (admin)
- `POST /v1/directory/entries` — add person to directory (admin)
- `PATCH /v1/directory/entries/:id` — update entry (admin)
- `DELETE /v1/directory/entries/:id` — deactivate entry (sets `is_active = false`)
- `GET /v1/directory/search?q=<name>` — name search (internal; returns matching entries)

**Steps:**
1. Create `DirectoryModule` with `DirectoryService`
2. Seed script (from Task 1.4) should have already created root org unit + 3 department units
3. Search: use PostgreSQL `to_tsvector` query against the GIN index; return top 10 results
4. Designation search endpoint exists in service layer but is NOT exposed via HTTP in Phase 1 (private method, `@internal` JSDoc)

**Acceptance:**
- `GET /v1/directory/units` returns tree with Hotel > [Reception, Housekeeping, Room Service]
- Search `?q=recep` returns Reception department entry
- Deactivating an entry sets `is_active = false`; it no longer appears in search results

---

## M7 — Calling Engine

### Task 7.1 — Signaling server scaffold (`apps/signaling-server`)
**Description:** Bootstrap the Socket.io signaling server.

**Steps:**
1. Create Node.js + TypeScript app with Socket.io
2. Install: `socket.io`, `ioredis`, `jsonwebtoken`, `axios` (for grant check calls to api-server)
3. On connection: validate JWT from handshake auth, extract `{ sub, tenant_id, entity_type, room, grants }`
4. Maintain in-memory + Redis presence map: `presence:{tenant_id}:{dept}` → set of connected staff socket IDs
5. Namespaces: `/call` (calling), `/service` (service request status updates)
6. Health endpoint: `GET /health`

**Acceptance:** Signaling server starts on port 3002; valid JWT connects; invalid JWT gets disconnected with error event.

---

### Task 7.2 — Call initiation and routing
**Description:** Implement call setup, SDP/ICE relay, and metadata logging.

**Socket events (client → server):**
- `call:initiate` — `{ to_dept: string, call_id: string }`
- `call:accept` — `{ call_id: string }`
- `call:reject` — `{ call_id: string }`
- `call:ice-candidate` — `{ call_id: string, candidate: object }`
- `call:sdp` — `{ call_id: string, sdp: object }`
- `call:end` — `{ call_id: string }`

**Socket events (server → client):**
- `call:incoming` — `{ call_id, from_room, dept }`
- `call:accepted` — `{ call_id, peer_socket_id }`
- `call:rejected` — `{ call_id }`
- `call:ended` — `{ call_id }`
- `call:error` — `{ call_id, code, message }`

**Steps:**
1. On `call:initiate`:
   a. Check grant is ACTIVE and `calling_restricted = FALSE` via `AccessService.checkPrivilege()` (Redis-cached)
   b. Check rate limit (10 calls/hour, Redis sliding window)
   c. Look up available staff in `to_dept` from presence map
   d. If no staff available: emit `call:error { code: 'NO_STAFF_AVAILABLE' }`
   e. Pick one staff socket (round-robin), emit `call:incoming` to staff
   f. Log call initiation to `call_logs` (outcome = null at this point)
2. On `call:accept`: relay `call:accepted` to guest with staff's socket ID; update `call_logs.answered_at`
3. On `call:sdp` and `call:ice-candidate`: relay to the other peer only (signaling only — no audio)
4. On `call:end`: emit `call:ended` to both peers; update `call_logs.ended_at`, `duration_secs`, `outcome`
5. On disconnect mid-call: treat as `call:end` with `outcome = 'FAILED'`

**Acceptance:**
- Two browser tabs (guest + staff) can complete a full call setup via signaling
- `call_logs` row has correct `answered_at` and `duration_secs` after call ends
- Guest with `calling_restricted = TRUE` gets `call:error` on initiate, not a ringing staff

---

### Task 7.3 — WebRTC client library (`packages/core`)
**Description:** Shared WebRTC peer connection logic used by both guest and staff PWAs.

**Steps:**
1. Create `packages/core/src/webrtc/WebRtcClient.ts`
2. Implement:
   - `createPeerConnection(iceServers: RTCIceServer[])` — creates `RTCPeerConnection`
   - `createOffer()` → SDP offer
   - `handleAnswer(sdp)` — set remote description
   - `handleIceCandidate(candidate)` — add ICE candidate
   - `addAudioTrack()` — request mic permission, add to peer connection
   - `getIceServers(coturnConfig)` — returns STUN + TURN server config with time-limited TURN credentials
3. TURN credentials: use HMAC-SHA1 time-limited credentials (coturn `use-auth-secret` mode)
4. Ice candidate strategy: try host candidates first, then STUN, then TURN relay — standard WebRTC behavior

**Acceptance:** Unit tests for offer/answer flow using `wrtc` (Node WebRTC implementation) or mock; TURN credential generation produces valid HMAC credentials.

---

### Task 7.4 — Abuse reporting
**Description:** Staff can file abuse reports; admin can restrict calling.

**Endpoints:**
- `POST /v1/calls/:call_id/abuse-report` — staff files report
- `GET /v1/abuse-reports` — list open reports (admin)
- `PATCH /v1/abuse-reports/:id/action` — admin marks actioned + optionally restricts calling

**Steps:**
1. `POST abuse-report`: create `abuse_reports` row, notify admin via event (log for now)
2. `PATCH action`: set `status = ACTIONED`; if `restrict_calling: true` in body, call `AccessService.restrictCalling(subject_id)`
3. `restrictCalling`: sets `access_grants.calling_restricted = TRUE`, invalidates Redis privilege cache

**Acceptance:**
- Filing report creates row in `abuse_reports`
- After admin actions with restrict, subsequent `call:initiate` from that guest returns `call:error`

---

## M8 — Guest Check-In PWA

### Task 8.1 — Next.js guest PWA scaffold (`apps/guest-pwa`)
**Description:** Bootstrap the guest PWA with routing and shared layout.

**Steps:**
1. Create Next.js 14 app (App Router) with TypeScript
2. Install: `@tanstack/react-query`, `react-hook-form`, `zod`, `socket.io-client`
3. Configure PWA manifest (`manifest.json`): name, icons, `display: standalone`, `start_url`
4. Configure Service Worker (Next.js `next-pwa` or custom) for offline shell caching
5. Set up `packages/api-client` with typed fetch wrappers for all API endpoints
6. Set up `@tanstack/react-query` provider and devtools
7. Create shared layout: hotel branding header (logo from tenant config), bottom nav for dashboard pages
8. Create `AuthContext` storing JWT + identity state, persisted to `sessionStorage`

**Acceptance:** PWA loads in mobile Chrome; "Add to Home Screen" prompt appears; app shell loads offline after first visit.

---

### Task 8.2 — Guest check-in flow (Steps 1–3)
**Description:** Implement the multi-step check-in form.

**Pages:** `/checkin`, `/checkin/verify`, `/checkin/upload`

**Steps:**
1. **Step 1 — Booking details** (`/checkin`):
   - Fields: Booking Reference ID (required), Full Name (required)
   - Validate with Zod; on submit call `POST /v1/auth/guest/otp/send`
   - Navigate to `/checkin/verify`

2. **Step 2 — OTP verification** (`/checkin/verify`):
   - 6-digit OTP input (auto-focus, numeric keyboard)
   - Resend OTP button (disabled for 60s after send)
   - On success: JWT stored in `AuthContext`; call `POST /v1/identities/self-register` with booking ref + name
   - Handle 409 CONFLICT (duplicate): show "We found an existing record for this booking — please proceed to check in at the front desk"

3. **Step 3 — Document upload** (`/checkin/upload`):
   - File input accepting JPEG/PNG/PDF, max 5 MB, with preview
   - Progress indicator during upload
   - On success: redirect based on hotel check-in mode:
     - AUTO_APPROVE → `/dashboard`
     - STAFF_CONFIRM → `/checkin/pending`

**Acceptance:**
- Full flow completes end-to-end in Chrome mobile (dev environment)
- OTP `123456` works in dev
- File > 5 MB shows client-side error before upload

---

### Task 8.3 — Guest dashboard
**Description:** Guest home screen after successful check-in.

**Page:** `/dashboard`

**Sections:**
1. **WiFi credentials card** — SSID and password from grant data (fetched from `GET /v1/guests/me/grant`)
2. **Call buttons** — three large buttons: Reception, Housekeeping, Room Service; disabled if `calling_restricted = TRUE`
3. **Active service requests** — list of current requests with status badges
4. **Quick request button** — shortcut to `/requests/new`

**Steps:**
1. Fetch grant data on page load; show skeleton loaders during fetch
2. Poll grant status every 60s — if grant is `REVOKED` or `EXPIRED`, redirect to `/checkin` with "Your stay has ended" message
3. Call button tap → navigate to `/call/{department}` (Task 8.4)

**Acceptance:**
- Dashboard shows correct WiFi SSID and password
- Revoked grant redirects guest out of dashboard within 60s of revocation
- Disabled call buttons shown (greyed out) when `calling_restricted = TRUE`

---

### Task 8.4 — Guest call screen
**Description:** WebRTC call UI for the guest.

**Page:** `/call/:department`

**Steps:**
1. On page load: connect to signaling server with JWT; emit `call:initiate { to_dept, call_id: uuid }`
2. Show "Calling Reception..." screen with animated ring indicator and Cancel button
3. On `call:accepted`: use `WebRtcClient` (Task 7.3) to create offer, exchange SDP/ICE via signaling
4. On media stream connected: show "Connected" with elapsed timer and End Call button
5. On `call:ended` or `call:error`: show outcome screen with appropriate message
6. End Call button: emit `call:end`, navigate back to `/dashboard`
7. Error states: `NO_STAFF_AVAILABLE` → "All staff are busy, please try again"; `CALLING_RESTRICTED` → "Calling is currently restricted on your account"
8. Request microphone permission before initiating call; handle denial gracefully

**Acceptance:**
- Guest and staff (Task 9.4) can hear each other clearly in a call on local dev
- Call timer increments correctly
- Navigating away from call page emits `call:end`

---

### Task 8.5 — Web Push for incoming calls (guest → staff only in Phase 1)
**Description:** Web Push notification so staff PWA can receive incoming calls when tab is backgrounded.

> Note: Push goes to **staff**, not guests — guests initiate calls, staff receives them.

**Steps:**
1. Generate VAPID key pair; store public key in `packages/config`, private key in Secrets Manager
2. On staff PWA load: request Notification permission; subscribe to push via `navigator.serviceWorker`; POST subscription to `POST /v1/push/subscribe`
3. Store push subscription in `push_subscriptions` table (`identity_id`, `endpoint`, `keys`, `created_at`)
4. In signaling server `call:incoming` handler: call `api-server POST /internal/push/call-incoming` with `{ staff_identity_id, call_id, from_room }`
5. API server sends Web Push to all active subscriptions for that staff member
6. Service Worker receives push → shows notification: "Incoming call from Room 201" with Accept/Reject actions
7. Clicking notification opens staff PWA `/call` page

**Acceptance:**
- Staff PWA with tab in background receives push notification within 3 seconds of guest initiating call
- Clicking notification opens call screen

---

## M9 — Staff PWA

### Task 9.1 — Staff PWA scaffold (`apps/staff-pwa`)
**Description:** Bootstrap the staff PWA (mirrors guest PWA setup).

**Steps:**
1. Create Next.js 14 app, same tooling as guest PWA (Task 8.1)
2. Auth: email + password login page → calls `POST /v1/auth/staff/login`
3. Store JWT in `AuthContext`; redirect to `/dashboard` on login
4. PWA manifest for staff app (different name/icon)

**Acceptance:** Staff logs in with seeded credentials, reaches dashboard.

---

### Task 9.2 — Staff service request queue
**Description:** Staff view for managing service requests.

**Pages:** `/requests`, `/requests/:id`

**Steps:**
1. List page: shows requests filtered by staff's department, ordered by `created_at DESC`
2. Real-time updates: connect to signaling server `/service` namespace; listen for `request:new` and `request:updated` events
3. Detail page: shows guest room, request category, details; buttons to update status (`IN_PROGRESS`, `COMPLETED`)
4. Updating status: `PATCH /v1/service-requests/:id` → broadcasts `request:updated` event to guest's socket

**Acceptance:**
- New request placed by guest appears on staff queue in real time (< 2s)
- Status update propagates to guest dashboard in real time

---

### Task 9.3 — Staff call screen + abuse reporting
**Description:** Staff-side incoming call UI.

**Page:** `/call`

**Steps:**
1. Connect to signaling server on PWA load (always-on connection while logged in)
2. On `call:incoming`: show full-screen incoming call overlay with "Room 201 is calling" — room number, NOT phone number
3. Accept: emit `call:accept`, initiate WebRTC answer flow using `WebRtcClient`
4. Reject: emit `call:reject`, dismiss overlay
5. During call: show room identifier + elapsed timer + "Report Abuse" button + End Call
6. "Report Abuse": opens modal with reason text field; on submit calls `POST /v1/calls/:id/abuse-report`

**Acceptance:**
- Staff sees room number only (not guest mobile) during call
- Abuse report modal submits and shows confirmation
- Staff can receive second call after first call ends (connection persists)

---

## M10 — Admin Web Dashboard

### Task 10.1 — Admin web scaffold (`apps/admin-web`)
**Description:** Bootstrap the admin Next.js app.

**Steps:**
1. Create Next.js 14 app with same tooling as other apps
2. Auth: email + password login
3. Layout: sidebar navigation with sections: Dashboard, Check-Ins, Guests, Staff, Calls, Reports, Settings
4. Role guard: pages requiring ADMIN role redirect to login if STAFF token lacks the role

**Acceptance:** Admin logs in and sees sidebar layout.

---

### Task 10.2 — Check-in approval queue
**Description:** Front-desk view for approving pending guest check-ins.

**Page:** `/checkin`

**Steps:**
1. Table of `identity_records` where `status = PENDING`, ordered by `created_at`
2. Each row: guest name, booking ref, submitted time, "Review" action
3. Review modal:
   - Shows guest details + ID document (signed URL, renders inline image or PDF link)
   - Dedup warning banner if another record matched (shows existing record link)
   - Buttons: Approve (calls `PATCH /v1/identities/:id/approve`), Reject (with reason input), Merge (if duplicate)
   - Check-in datetime picker: defaults to now; check-out datetime picker: required before approval
4. On approve: grant is issued; guest's PWA transitions to dashboard automatically

**Acceptance:**
- Approving a pending check-in creates an access grant and WiFi voucher
- Duplicate banner shown when dedup hash collision exists
- Check-out date is required to approve (frontend + backend validation)

---

### Task 10.3 — Guest management & early checkout
**Description:** Guest list and early checkout capability.

**Page:** `/guests`, `/guests/:id`

**Steps:**
1. List page: active guests (grants with `status = ACTIVE`), searchable by room or name
2. Detail page: guest profile, current grant (valid_from/until, status, WiFi credential), call history summary, service requests
3. Early checkout button: confirmation dialog → `PATCH /v1/grants/:id/revoke { reason: 'EARLY_CHECKOUT', revoked_by }`
4. Restrict calling toggle: `PATCH /v1/grants/:id/restrict-calling`

**Acceptance:**
- Early checkout immediately revokes grant; guest PWA redirects to check-in within one polling cycle
- Restrict calling toggle reflects correctly in UI after save

---

### Task 10.4 — Staff directory management
**Description:** Admin manages hotel staff.

**Page:** `/staff`, `/staff/new`, `/staff/:id/edit`

**Steps:**
1. Staff list: table of `directory_entries` with name, department, status, last active
2. Add staff form: full name, email, password, department assignment
3. On add: `POST /v1/identities` (Path A, `entity_type: STAFF`) + `POST /v1/directory/entries`
4. Edit: update name, department
5. Deactivate: `DELETE /v1/directory/entries/:id` (sets `is_active = false`)

**Acceptance:**
- New staff member can log in immediately after creation
- Deactivated staff cannot log in (add deactivation check to auth service)

---

### Task 10.5 — Call metadata log view
**Description:** Searchable call log for misuse investigation.

**Page:** `/calls`

**Steps:**
1. Table: date/time, room number, department called, duration, outcome, TURN-relayed indicator
2. Filters: date range picker, department selector, room number search, outcome filter
3. Pagination: cursor-based, 50 rows per page
4. Export: `GET /v1/calls/export?format=csv` for legal request response (requires ADMIN role)
5. No audio playback UI — metadata only. Add visible disclaimer: "Audio is not recorded."

**Acceptance:**
- Filter by room number returns correct results
- CSV export contains same data as table view
- No audio controls anywhere on this page

---

### Task 10.6 — Abuse reports management
**Description:** Admin reviews and actions abuse reports.

**Page:** `/abuse-reports`

**Steps:**
1. Table of `abuse_reports` with `status = OPEN`, sorted by `created_at DESC`
2. Each row: guest name, room, reporting staff, call ID, reason, time
3. Action modal: Mark as Reviewed, or Action + Restrict Calling (checkbox)
4. Actioning with restrict: calls `PATCH /v1/abuse-reports/:id/action { restrict_calling: true }`

**Acceptance:**
- Open reports count shown in sidebar badge
- Actioning with restrict updates guest's grant and disables calling in real time

---

### Task 10.7 — Hotel settings page
**Description:** Admin configures hotel-specific settings.

**Page:** `/settings`

**Sections:**
1. **Check-in mode**: toggle AUTO_APPROVE / STAFF_CONFIRM → updates `tenants.config.checkin_mode`
2. **WiFi configuration**: SSID input, password input (masked) → stored in `tenants.config.wifi`
3. **Rate limiting**: calls per hour per guest (default 10) → stored in `tenants.config.call_rate_limit`
4. **OTP provider**: read-only showing AWS SNS (Phase 1 only)

**Acceptance:**
- Changing check-in mode takes effect immediately for new check-in submissions
- WiFi credentials shown to guest reflect what is configured here

---

## M11 — Service Requests

### Task 11.1 — Service request API
**Description:** Backend for guest service requests.

**Endpoints:**
- `POST /v1/service-requests` — guest places request
- `GET /v1/service-requests` — list (guest sees own; staff sees department)
- `PATCH /v1/service-requests/:id` — update status (staff only)

**Steps:**
1. Create `ServiceRequestModule`
2. Validate guest has an ACTIVE grant before allowing request submission
3. On create: emit `request:new` Socket.io event to the target department namespace
4. On status update: emit `request:updated` to guest's socket

**Acceptance:**
- Guest without active grant gets 403 on request creation
- Status update reaches guest socket within 1 second

---

### Task 11.2 — Guest service request UI
**Description:** Guest pages for placing and tracking requests.

**Pages:** `/requests`, `/requests/new`

**Steps:**
1. New request form: category selector (Laundry, Room Service), optional notes, submit
2. List page: shows all current-stay requests with status badges (color-coded)
3. Real-time status updates via Socket.io `/service` namespace

**Acceptance:**
- Guest submits laundry request; it appears immediately on staff queue (Task 9.2)
- Status change by staff reflects on guest request list in real time

---

## M12 — Retention & Compliance

### Task 12.1 — Retention rules seed data and erasure job
**Description:** Implement DPDP-compliant data retention.

**Steps:**
1. Add seed data to `retention_rules` table with platform defaults:
   - `KYC_DOCUMENT`: 365 days, `statutory = TRUE`
   - `BOOKING_PROFILE`: 90 days, `statutory = FALSE`
   - `CALL_METADATA`: 90 days, `statutory = FALSE`
   - `SERVICE_REQUEST`: 30 days, `statutory = FALSE`
2. When creating `data_subject_records` rows (in document upload, identity creation, call log, service request), set `expires_at = created_at + retention_rule.retention_days`
3. Implement nightly erasure job (02:00 IST cron):
   - Query expired, non-erased, non-blocked records
   - Delete S3 objects for KYC_DOCUMENT records
   - Nullify PII fields for DB-backed records (name → `[ERASED]`, mobile → `[ERASED]`) — do not hard-delete rows (audit trail)
   - Set `erased_at = NOW()`
4. Guest deletion request endpoint: `DELETE /v1/guests/me/data`
   - Marks non-statutory records for immediate erasure (`expires_at = NOW()`)
   - Returns list of records that cannot be erased yet due to statutory rules, with reason and date

**Acceptance:**
- Erasure job runs without errors; erased records show `[ERASED]` in PII fields
- Guest deletion request correctly blocks KYC erasure with statutory notice
- Non-statutory records (call metadata) are erased on guest request

---

## M13 — Infrastructure & Deployment

### Task 13.1 — Terraform for AWS resources
**Description:** Define all AWS infrastructure as Terraform code.

> Before writing: query AWS documentation for current Amplify Hosting + RDS + EC2 best-practice patterns in ap-south-1.

**Resources to define:**
1. VPC with public/private subnets (ap-south-1a, ap-south-1b)
2. RDS PostgreSQL 15 (`db.t3.micro`, private subnet, security group: API server only)
3. ElastiCache Redis (`cache.t3.micro`, private subnet)
4. EC2 `t3.small` for API server (private subnet, behind ALB)
5. EC2 `t3.small` for signaling server (private subnet, behind ALB — WSS)
6. EC2 `t3.small` + Elastic IP for coturn (public subnet — needs public IP for TURN)
7. ALB for API server and signaling server (HTTPS → HTTP internally)
8. S3 buckets: KYC (`-kyc-docs`) + assets (`-app-assets`) — both private, versioning enabled, lifecycle rules per retention categories
9. Secrets Manager secrets: DB creds, JWT secrets, VAPID keys
10. CloudWatch log groups and basic alarms (CPU > 80%, DB connections > 80%)

**Acceptance:** `terraform plan` runs without errors; no resources with public access except ALB and coturn EC2.

---

### Task 13.2 — Amplify Hosting for PWAs
**Description:** Deploy all three Next.js apps to AWS Amplify Hosting.

**Steps:**
1. Create `amplify.yml` for each app (build settings, env var mappings)
2. Configure three Amplify apps: `guest`, `staff`, `admin`
3. Set custom domains (or Amplify-provided subdomains for pilot)
4. Configure environment variables in Amplify console pointing to Secrets Manager values
5. Set up branch-based deployments: `main` → production, `dev` → staging

**Acceptance:** All three PWAs build and deploy via Amplify; guest PWA accessible at configured URL.

---

### Task 13.3 — coturn setup and configuration
**Description:** Configure self-hosted coturn on EC2.

**Steps:**
1. Write EC2 user-data script (or Ansible playbook) that installs coturn on Ubuntu 22.04
2. `turnserver.conf` settings:
   - `use-auth-secret` mode (HMAC time-limited credentials)
   - `static-auth-secret` from Secrets Manager
   - `realm = turn.<domain>`
   - `min-port=49152`, `max-port=65535`
   - TLS cert (Let's Encrypt or ACM-issued)
   - `no-tcp-relay` (UDP only for media)
   - Logging to CloudWatch
3. Security group: UDP 3478 (STUN/TURN), UDP 49152-65535 (relay range), TCP 443 (TLS TURN)
4. Update `WebRtcClient.getIceServers()` to use the deployed coturn Elastic IP

**Acceptance:** `turnutils_uclient` from a different network successfully relays data via the coturn server; TURN credentials expire after 1 hour.

---

### Task 13.4 — CI/CD pipeline
**Description:** GitHub Actions pipeline for test, build, and deploy.

**Jobs:**
1. `lint-and-test`: runs on every PR — `pnpm lint`, `pnpm test`
2. `build`: runs on push to `main` — `pnpm build` for all apps
3. `deploy-amplify`: triggers Amplify build via webhook on push to `main`
4. `migrate`: runs `prisma migrate deploy` on push to `main` (against production DB via Secrets Manager)

**Steps:**
1. Write `.github/workflows/ci.yml`
2. Configure GitHub secrets: AWS credentials (least-privilege IAM role), DB URL, Amplify webhook URLs
3. Add `pnpm test --run` script to each package (Vitest)

**Acceptance:** PR CI passes; push to main triggers deploy pipeline; migrations run automatically.

---

## Summary: Task Count by Milestone

| Milestone | Tasks | Key Output |
|---|---|---|
| M1 — Scaffold | 1.1–1.4 | Monorepo, Docker, DB schema |
| M2 — Interfaces | 2.1–2.2 | Adapter contracts, stubs |
| M3 — Auth | 3.1–3.4 | OTP auth, staff auth, tenant guard |
| M4 — Identity | 4.1–4.2 | Check-in registration, KYC upload |
| M5 — Access | 5.1–5.2 | Grant issuance, expiry job |
| M6 — Directory | 6.1 | Hotel org tree, search |
| M7 — Calling | 7.1–7.4 | Signaling, WebRTC, rate limit, abuse |
| M8 — Guest PWA | 8.1–8.5 | Full guest journey |
| M9 — Staff PWA | 9.1–9.3 | Staff calls + requests |
| M10 — Admin | 10.1–10.7 | Full admin dashboard |
| M11 — Service Req | 11.1–11.2 | Laundry/room service |
| M12 — Retention | 12.1 | DPDP erasure engine |
| M13 — Infra | 13.1–13.4 | Terraform, Amplify, coturn, CI/CD |
| **Total** | **34 tasks** | **Phase 1 complete** |

---

## Recommended Build Order (shortest path to first demo)

For a working pilot demo as fast as possible, build in this order:

```
1.1 → 1.2 → 1.3 → 1.4        # foundation
→ 2.1 → 2.2                   # interfaces
→ 3.1 → 3.2 → 3.3 → 3.4      # auth (unblocks everything)
→ 4.1 → 4.2                   # identity + KYC
→ 5.1 → 5.2                   # grants (enables check-in approval)
→ 6.1                          # directory
→ 8.1 → 8.2 → 8.3             # guest PWA shell + check-in
→ 10.1 → 10.2                 # admin login + approval queue
  ← DEMO CHECKPOINT: Guest checks in, admin approves, guest reaches dashboard →
→ 7.1 → 7.2 → 7.3             # signaling + WebRTC
→ 8.4 → 8.5                   # guest call screen
→ 9.1 → 9.2 → 9.3             # staff PWA
  ← DEMO CHECKPOINT: Guest calls Reception, staff answers →
→ 11.1 → 11.2                 # service requests
→ 10.3 → 10.4 → 10.5 → 10.6 → 10.7  # remaining admin pages
→ 12.1                         # retention
→ 7.4                          # abuse reporting
→ 13.1 → 13.2 → 13.3 → 13.4  # production infra
```
