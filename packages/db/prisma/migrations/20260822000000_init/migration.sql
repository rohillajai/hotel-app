-- ─── Migration: 20260822000000_init ─────────────────────────────────────────
-- Initial schema for Hotel App Phase 1
-- Auto-generated base + manual additions for:
--   1. GIN full-text index on directory_entries (name + designation search)
--   2. Partial index on access_grants for expiry job (time-boxed grants only)
--   3. Partial index on data_subject_records for erasure job
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Extensions (also in postgres/init.sql — idempotent) ─────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ─── Enums ───────────────────────────────────────────────────────────────────
CREATE TYPE "TenantType" AS ENUM ('HOTEL', 'GOVT', 'OFFICE');
CREATE TYPE "EntityType" AS ENUM ('GUEST', 'STAFF', 'ADMIN', 'SUPER_ADMIN');
CREATE TYPE "IdentityStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'MERGED', 'DEACTIVATED');
CREATE TYPE "RegistrationPath" AS ENUM ('A', 'B');
CREATE TYPE "OrgUnitType" AS ENUM ('ORGANIZATION', 'DEPARTMENT', 'TEAM', 'DIVISION');
CREATE TYPE "GrantStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED', 'SUSPENDED');
CREATE TYPE "GrantType" AS ENUM ('HOTEL_STAY', 'STAFF_ROLE', 'GOVT_USER', 'OFFICE_USER');
CREATE TYPE "WifiVoucherStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');
CREATE TYPE "CallOutcome" AS ENUM ('ANSWERED', 'MISSED', 'REJECTED', 'FAILED');
CREATE TYPE "AbuseReportStatus" AS ENUM ('OPEN', 'REVIEWED', 'ACTIONED');
CREATE TYPE "ServiceRequestStatus" AS ENUM ('SUBMITTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "PurposeCategory" AS ENUM (
    'KYC_DOCUMENT', 'BOOKING_PROFILE', 'CALL_METADATA', 'SERVICE_REQUEST', 'PUSH_SUBSCRIPTION'
);

-- ─── tenants ─────────────────────────────────────────────────────────────────
CREATE TABLE "tenants" (
    "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
    "name"        VARCHAR(255) NOT NULL,
    "tenant_type" "TenantType" NOT NULL,
    "config"      JSONB       NOT NULL DEFAULT '{}',
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- ─── identity_records ────────────────────────────────────────────────────────
CREATE TABLE "identity_records" (
    "id"                UUID             NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"         UUID             NOT NULL,
    "entity_type"       "EntityType"     NOT NULL,
    "status"            "IdentityStatus" NOT NULL DEFAULT 'PENDING',
    "registration_path" "RegistrationPath" NOT NULL,
    "profile"           JSONB            NOT NULL DEFAULT '{}',
    "dedup_hash"        VARCHAR(64),
    "created_by"        UUID,
    "approved_by"       UUID,
    "approved_at"       TIMESTAMPTZ,
    "merged_into"       UUID,
    "created_at"        TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    "updated_at"        TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    CONSTRAINT "identity_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_identity_tenant_status" ON "identity_records"("tenant_id", "status");
CREATE INDEX "idx_identity_dedup"         ON "identity_records"("tenant_id", "dedup_hash");
CREATE INDEX "idx_identity_tenant_type"   ON "identity_records"("tenant_id", "entity_type");

-- ─── org_units ───────────────────────────────────────────────────────────────
CREATE TABLE "org_units" (
    "id"          UUID          NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"   UUID          NOT NULL,
    "parent_id"   UUID,
    "name"        VARCHAR(255)  NOT NULL,
    "unit_type"   "OrgUnitType" NOT NULL,
    "metadata"    JSONB         NOT NULL DEFAULT '{}',
    "created_at"  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    "updated_at"  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT "org_units_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_org_unit_tenant_parent" ON "org_units"("tenant_id", "parent_id");

-- ─── directory_entries ───────────────────────────────────────────────────────
CREATE TABLE "directory_entries" (
    "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"    UUID        NOT NULL,
    "org_unit_id"  UUID        NOT NULL,
    "identity_id"  UUID        NOT NULL,
    "designation"  VARCHAR(255),
    "display_name" VARCHAR(255) NOT NULL,
    "is_active"    BOOLEAN     NOT NULL DEFAULT TRUE,
    "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "directory_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_dir_org_unit"      ON "directory_entries"("org_unit_id", "is_active");
CREATE INDEX "idx_dir_tenant_active" ON "directory_entries"("tenant_id", "is_active");

-- GIN full-text search index on display_name + designation
-- This is the Phase 2 designation-search index — built now, exposed later.
CREATE INDEX "idx_dir_fts" ON "directory_entries"
    USING GIN (
        to_tsvector('english',
            "display_name" || ' ' || COALESCE("designation", '')
        )
    );

-- ─── access_grants ───────────────────────────────────────────────────────────
CREATE TABLE "access_grants" (
    "id"                UUID          NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"         UUID          NOT NULL,
    "subject_id"        UUID          NOT NULL,
    "grant_type"        "GrantType"   NOT NULL,
    "privileges"        TEXT[]        NOT NULL DEFAULT '{}',
    "status"            "GrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "valid_from"        TIMESTAMPTZ   NOT NULL,
    "valid_until"       TIMESTAMPTZ,                     -- NULL = indefinite (Phase 2)
    "calling_restricted" BOOLEAN      NOT NULL DEFAULT FALSE,
    "revoked_at"        TIMESTAMPTZ,
    "revoked_by"        UUID,
    "revoke_reason"     VARCHAR(255),
    "metadata"          JSONB         NOT NULL DEFAULT '{}',
    "created_at"        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    "updated_at"        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT "access_grants_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_grant_subject" ON "access_grants"("subject_id", "status");

-- Partial index: only time-boxed grants — used by the 5-minute expiry job.
-- Indefinite grants (valid_until IS NULL) are never included, keeping the index tiny.
CREATE INDEX "idx_grant_expiry" ON "access_grants"("valid_until", "status")
    WHERE "valid_until" IS NOT NULL;

-- ─── wifi_vouchers ───────────────────────────────────────────────────────────
CREATE TABLE "wifi_vouchers" (
    "id"          UUID                NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"   UUID                NOT NULL,
    "grant_id"    UUID                NOT NULL,
    "subject_id"  UUID                NOT NULL,
    "ssid"        VARCHAR(255)        NOT NULL,
    "credential"  VARCHAR(255)        NOT NULL,
    "status"      "WifiVoucherStatus" NOT NULL DEFAULT 'ACTIVE',
    "external_id" VARCHAR(255),
    "created_at"  TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    "updated_at"  TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    CONSTRAINT "wifi_vouchers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_wifi_grant"   ON "wifi_vouchers"("grant_id");
CREATE INDEX "idx_wifi_subject" ON "wifi_vouchers"("subject_id", "status");

-- ─── call_logs ───────────────────────────────────────────────────────────────
CREATE TABLE "call_logs" (
    "id"             UUID           NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"      UUID           NOT NULL,
    "caller_id"      UUID           NOT NULL,
    "callee_dept"    VARCHAR(50),
    "callee_id"      UUID,
    "room_identifier" VARCHAR(50),
    "call_id"        UUID           NOT NULL,
    "initiated_at"   TIMESTAMPTZ    NOT NULL,
    "answered_at"    TIMESTAMPTZ,
    "ended_at"       TIMESTAMPTZ,
    "duration_secs"  INTEGER,
    "outcome"        "CallOutcome",
    "turn_relayed"   BOOLEAN        NOT NULL DEFAULT FALSE,
    "created_at"     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_call_log_caller"  ON "call_logs"("tenant_id", "caller_id");
CREATE INDEX "idx_call_log_dept"    ON "call_logs"("tenant_id", "callee_dept");
CREATE INDEX "idx_call_log_time"    ON "call_logs"("tenant_id", "initiated_at");
CREATE INDEX "idx_call_log_call_id" ON "call_logs"("call_id");

-- ─── abuse_reports ───────────────────────────────────────────────────────────
CREATE TABLE "abuse_reports" (
    "id"           UUID                NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"    UUID                NOT NULL,
    "reported_by"  UUID                NOT NULL,
    "subject_id"   UUID                NOT NULL,
    "call_id"      UUID,
    "reason"       TEXT                NOT NULL,
    "status"       "AbuseReportStatus" NOT NULL DEFAULT 'OPEN',
    "created_at"   TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    "updated_at"   TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    CONSTRAINT "abuse_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_abuse_tenant_status" ON "abuse_reports"("tenant_id", "status");
CREATE INDEX "idx_abuse_subject"       ON "abuse_reports"("subject_id");

-- ─── service_requests ────────────────────────────────────────────────────────
CREATE TABLE "service_requests" (
    "id"              UUID                   NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"       UUID                   NOT NULL,
    "guest_id"        UUID                   NOT NULL,
    "department"      VARCHAR(50)            NOT NULL,
    "category"        VARCHAR(50)            NOT NULL,
    "details"         JSONB                  NOT NULL DEFAULT '{}',
    "status"          "ServiceRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "assigned_to"     UUID,
    "room_identifier" VARCHAR(50)            NOT NULL,
    "created_at"      TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
    "updated_at"      TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_svc_dept_status" ON "service_requests"("tenant_id", "department", "status");
CREATE INDEX "idx_svc_guest"       ON "service_requests"("guest_id", "status");

-- ─── refresh_tokens ──────────────────────────────────────────────────────────
CREATE TABLE "refresh_tokens" (
    "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
    "subject_id" UUID        NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "user_agent" VARCHAR(500),
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "refresh_tokens_pkey"     PRIMARY KEY ("id"),
    CONSTRAINT "refresh_tokens_hash_key" UNIQUE ("token_hash")
);

CREATE INDEX "idx_refresh_subject" ON "refresh_tokens"("subject_id", "revoked_at");

-- ─── push_subscriptions ──────────────────────────────────────────────────────
CREATE TABLE "push_subscriptions" (
    "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"    UUID        NOT NULL,
    "identity_id"  UUID        NOT NULL,
    "subscription" JSONB       NOT NULL,
    "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_push_identity" ON "push_subscriptions"("identity_id");

-- ─── retention_rules ─────────────────────────────────────────────────────────
CREATE TABLE "retention_rules" (
    "id"               UUID              NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"        UUID,                                -- NULL = platform default
    "purpose_category" "PurposeCategory" NOT NULL,
    "retention_days"   INTEGER           NOT NULL,
    "statutory"        BOOLEAN           NOT NULL DEFAULT FALSE,
    "description"      TEXT,
    "updated_at"       TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    CONSTRAINT "retention_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_retention_tenant_category" UNIQUE ("tenant_id", "purpose_category")
);

-- ─── data_subject_records ────────────────────────────────────────────────────
CREATE TABLE "data_subject_records" (
    "id"                 UUID              NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"          UUID              NOT NULL,
    "subject_id"         UUID              NOT NULL,
    "purpose_category"   "PurposeCategory" NOT NULL,
    "data_ref"           VARCHAR(500)      NOT NULL,
    "expires_at"         TIMESTAMPTZ,
    "erased_at"          TIMESTAMPTZ,
    "erasure_blocked"    BOOLEAN           NOT NULL DEFAULT FALSE,
    "service_request_id" UUID,
    "created_at"         TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    CONSTRAINT "data_subject_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_dsr_subject_cat" ON "data_subject_records"("subject_id", "purpose_category");

-- Partial index for erasure job — only unerased, non-blocked, expired records
CREATE INDEX "idx_dsr_expiry" ON "data_subject_records"("expires_at")
    WHERE "erased_at" IS NULL AND "erasure_blocked" = FALSE;

-- ─── audit_logs ──────────────────────────────────────────────────────────────
CREATE TABLE "audit_logs" (
    "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"   UUID        NOT NULL,
    "actor_id"    UUID,
    "action"      VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(50)  NOT NULL,
    "entity_id"   UUID         NOT NULL,
    "before"      JSONB,
    "after"       JSONB,
    "meta"        JSONB        NOT NULL DEFAULT '{}',
    "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_audit_entity" ON "audit_logs"("tenant_id", "entity_type", "entity_id");
CREATE INDEX "idx_audit_actor"  ON "audit_logs"("tenant_id", "actor_id");
CREATE INDEX "idx_audit_time"   ON "audit_logs"("tenant_id", "created_at");

-- ─── Foreign Keys ────────────────────────────────────────────────────────────
-- Added after all tables exist to avoid ordering issues

ALTER TABLE "identity_records"
    ADD CONSTRAINT "identity_records_tenant_id_fkey"   FOREIGN KEY ("tenant_id")   REFERENCES "tenants"("id"),
    ADD CONSTRAINT "identity_records_created_by_fkey"  FOREIGN KEY ("created_by")  REFERENCES "identity_records"("id"),
    ADD CONSTRAINT "identity_records_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "identity_records"("id"),
    ADD CONSTRAINT "identity_records_merged_into_fkey" FOREIGN KEY ("merged_into") REFERENCES "identity_records"("id");

ALTER TABLE "org_units"
    ADD CONSTRAINT "org_units_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id"),
    ADD CONSTRAINT "org_units_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "org_units"("id");

ALTER TABLE "directory_entries"
    ADD CONSTRAINT "directory_entries_org_unit_id_fkey"  FOREIGN KEY ("org_unit_id")  REFERENCES "org_units"("id"),
    ADD CONSTRAINT "directory_entries_identity_id_fkey"  FOREIGN KEY ("identity_id")  REFERENCES "identity_records"("id");

ALTER TABLE "access_grants"
    ADD CONSTRAINT "access_grants_tenant_id_fkey"   FOREIGN KEY ("tenant_id")   REFERENCES "tenants"("id"),
    ADD CONSTRAINT "access_grants_subject_id_fkey"  FOREIGN KEY ("subject_id")  REFERENCES "identity_records"("id"),
    ADD CONSTRAINT "access_grants_revoked_by_fkey"  FOREIGN KEY ("revoked_by")  REFERENCES "identity_records"("id");

ALTER TABLE "wifi_vouchers"
    ADD CONSTRAINT "wifi_vouchers_tenant_id_fkey"  FOREIGN KEY ("tenant_id")  REFERENCES "tenants"("id"),
    ADD CONSTRAINT "wifi_vouchers_grant_id_fkey"   FOREIGN KEY ("grant_id")   REFERENCES "access_grants"("id"),
    ADD CONSTRAINT "wifi_vouchers_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "identity_records"("id");

ALTER TABLE "call_logs"
    ADD CONSTRAINT "call_logs_tenant_id_fkey"  FOREIGN KEY ("tenant_id")  REFERENCES "tenants"("id"),
    ADD CONSTRAINT "call_logs_caller_id_fkey"  FOREIGN KEY ("caller_id")  REFERENCES "identity_records"("id"),
    ADD CONSTRAINT "call_logs_callee_id_fkey"  FOREIGN KEY ("callee_id")  REFERENCES "identity_records"("id");

ALTER TABLE "abuse_reports"
    ADD CONSTRAINT "abuse_reports_tenant_id_fkey"   FOREIGN KEY ("tenant_id")   REFERENCES "tenants"("id"),
    ADD CONSTRAINT "abuse_reports_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "identity_records"("id"),
    ADD CONSTRAINT "abuse_reports_subject_id_fkey"  FOREIGN KEY ("subject_id")  REFERENCES "identity_records"("id"),
    ADD CONSTRAINT "abuse_reports_call_id_fkey"     FOREIGN KEY ("call_id")     REFERENCES "call_logs"("id");

ALTER TABLE "service_requests"
    ADD CONSTRAINT "service_requests_tenant_id_fkey"    FOREIGN KEY ("tenant_id")    REFERENCES "tenants"("id"),
    ADD CONSTRAINT "service_requests_guest_id_fkey"     FOREIGN KEY ("guest_id")     REFERENCES "identity_records"("id"),
    ADD CONSTRAINT "service_requests_assigned_to_fkey"  FOREIGN KEY ("assigned_to")  REFERENCES "identity_records"("id");

ALTER TABLE "refresh_tokens"
    ADD CONSTRAINT "refresh_tokens_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "identity_records"("id");

ALTER TABLE "push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_tenant_id_fkey"   FOREIGN KEY ("tenant_id")   REFERENCES "tenants"("id"),
    ADD CONSTRAINT "push_subscriptions_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "identity_records"("id");

ALTER TABLE "retention_rules"
    ADD CONSTRAINT "retention_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id");

ALTER TABLE "data_subject_records"
    ADD CONSTRAINT "data_subject_records_tenant_id_fkey"          FOREIGN KEY ("tenant_id")          REFERENCES "tenants"("id"),
    ADD CONSTRAINT "data_subject_records_subject_id_fkey"         FOREIGN KEY ("subject_id")         REFERENCES "identity_records"("id"),
    ADD CONSTRAINT "data_subject_records_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id");

ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id"),
    ADD CONSTRAINT "audit_logs_actor_id_fkey"  FOREIGN KEY ("actor_id")  REFERENCES "identity_records"("id");

-- ─── Audit log: prevent UPDATE and DELETE (append-only) ──────────────────────
CREATE RULE "audit_log_no_update" AS ON UPDATE TO "audit_logs" DO INSTEAD NOTHING;
CREATE RULE "audit_log_no_delete" AS ON DELETE TO "audit_logs" DO INSTEAD NOTHING;
