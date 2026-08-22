import { createHash } from 'crypto';
import type {
  IIdentityMatchingRule,
  MatchingKeySet,
} from '../interfaces/identity-matching-rule.interface';

/**
 * DefaultIdentityMatchingRule
 *
 * Phase 1 implementation of IIdentityMatchingRule.
 *
 * Algorithm:
 *   1. For each key in keySet.match_any:
 *      a. Extract the value from profile[key]
 *      b. Normalise: trim + lowercase (prevents case-sensitivity false negatives)
 *      c. Skip if value is empty/null
 *      d. Hash = SHA-256(`{tenantId}|{key}={normalisedValue}`)
 *   2. Return all computed hashes
 *
 * The caller (IdentityService) queries:
 *   WHERE tenant_id = $1 AND dedup_hash = ANY($hashes) AND status != 'REJECTED'
 *
 * A match on ANY hash triggers the dedup review flow (OR logic, conservative).
 *
 * The primary hash (stored on identity_records.dedup_hash) is the hash of
 * the first key in match_any that has a non-empty value.
 */
export class DefaultIdentityMatchingRule implements IIdentityMatchingRule {
  computeDedupHashes(
    tenantId: string,
    profile: Record<string, unknown>,
    keySet: MatchingKeySet,
  ): string[] {
    const hashes: string[] = [];

    for (const key of keySet.match_any) {
      const raw = profile[key];
      if (raw === null || raw === undefined || raw === '') continue;

      const normalised = String(raw).trim().toLowerCase();
      if (!normalised) continue;

      const input = `${tenantId}|${key}=${normalised}`;
      const hash = createHash('sha256').update(input, 'utf8').digest('hex');
      hashes.push(hash);
    }

    return hashes;
  }

  computePrimaryHash(
    tenantId: string,
    profile: Record<string, unknown>,
    keySet: MatchingKeySet,
  ): string | null {
    const hashes = this.computeDedupHashes(tenantId, profile, keySet);
    return hashes[0] ?? null;
  }
}
