-- ─── PostgreSQL init script ────────────────────────────────────────────────
-- This runs once when the container is first created.
-- Prisma migrations handle the actual schema; this file handles DB-level setup.

-- Enable the pgcrypto extension for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enable pg_trgm for future fuzzy-search support (directory search)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enable unaccent for accent-insensitive search (useful for Hindi names)
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Verify
SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto', 'pg_trgm', 'unaccent');
