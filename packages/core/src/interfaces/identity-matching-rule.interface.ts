/**
 * IIdentityMatchingRule — pluggable deduplication key computation
 *
 * The deduplication engine (IdentityService) computes a hash of the
 * identity's matching keys and queries identity_records.dedup_hash before
 * creating any new record. A match blocks creation and surfaces the existing
 * record to the reviewer.
 *
 * Phase 1 hotel matching keys (configured in tenant.config.dedup_rules):
 *   match_any: ['booking_ref', 'full_name']
 *   → A match on EITHER field triggers the dedup check (OR logic, conservative)
 *
 * Phase 2 govt matching keys (not built, just must not be blocked):
 *   match_any: ['employee_id', 'mobile']
 *
 * The matching key set lives in tenant config, not in application code.
 * A new tenant type only needs a new config entry, not a code change.
 */

export interface MatchingKeySet {
  /** Field names from identity_records.profile JSONB to include in the hash.
   *  OR logic: one hash is generated per key so any single match is a hit. */
  match_any: string[];
}

export interface IIdentityMatchingRule {
  /**
   * Compute one dedup hash per matching key.
   *
   * Returns an array because match_any logic means we need to check
   * each key independently — one hash per key, not one hash for all keys.
   *
   * Example for hotel (match_any: ['booking_ref', 'full_name']):
   *   profile = { full_name: 'Raj Kumar', booking_ref: 'BK-123', mobile: '9876543210' }
   *   keys = ['booking_ref', 'full_name']
   *   →  [
   *        SHA256('tenant-uuid|booking_ref=BK-123'),
   *        SHA256('tenant-uuid|full_name=raj kumar'),   ← normalised to lowercase
   *      ]
   *
   * The caller queries: WHERE dedup_hash = ANY($hashes)
   *
   * @param tenantId   Scopes hashes to the tenant — prevents cross-tenant collisions
   * @param profile    The identity profile JSONB object
   * @param keySet     The matching key set from tenant config
   */
  computeDedupHashes(
    tenantId: string,
    profile: Record<string, unknown>,
    keySet: MatchingKeySet,
  ): string[];

  /**
   * Compute the canonical (primary) dedup hash stored on the identity_record row.
   * This is the first hash from computeDedupHashes() — used for fast single-value
   * lookup in the most common case (exact booking_ref match).
   */
  computePrimaryHash(
    tenantId: string,
    profile: Record<string, unknown>,
    keySet: MatchingKeySet,
  ): string | null;
}
