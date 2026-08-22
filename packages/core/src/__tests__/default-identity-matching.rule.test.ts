import { describe, it, expect } from 'vitest';
import { DefaultIdentityMatchingRule } from '../adapters/default-identity-matching.rule';
import { createHash } from 'crypto';

const rule = new DefaultIdentityMatchingRule();

const TENANT_ID = 'tenant-abc-123';
const KEY_SET = { match_any: ['booking_ref', 'full_name'] };

function expectedHash(tenantId: string, key: string, value: string): string {
  return createHash('sha256')
    .update(`${tenantId}|${key}=${value.trim().toLowerCase()}`, 'utf8')
    .digest('hex');
}

describe('DefaultIdentityMatchingRule', () => {
  describe('computeDedupHashes', () => {
    it('returns one hash per matching key with a non-empty value', () => {
      const hashes = rule.computeDedupHashes(TENANT_ID, {
        booking_ref: 'BK-001',
        full_name: 'Raj Kumar',
        mobile: '9876543210',
      }, KEY_SET);

      expect(hashes).toHaveLength(2);
      expect(hashes[0]).toBe(expectedHash(TENANT_ID, 'booking_ref', 'BK-001'));
      expect(hashes[1]).toBe(expectedHash(TENANT_ID, 'full_name', 'Raj Kumar'));
    });

    it('skips keys with null / undefined / empty string values', () => {
      const hashes = rule.computeDedupHashes(TENANT_ID, {
        booking_ref: '',
        full_name: null,
      }, KEY_SET);

      expect(hashes).toHaveLength(0);
    });

    it('normalises to lowercase — same hash for different cases', () => {
      const h1 = rule.computeDedupHashes(TENANT_ID, { booking_ref: 'BK-001' }, KEY_SET);
      const h2 = rule.computeDedupHashes(TENANT_ID, { booking_ref: 'bk-001' }, KEY_SET);
      const h3 = rule.computeDedupHashes(TENANT_ID, { booking_ref: 'BK-001  ' }, KEY_SET); // trailing space

      expect(h1[0]).toBe(h2[0]);
      expect(h1[0]).toBe(h3[0]);
    });

    it('produces different hashes for different tenants (no cross-tenant collision)', () => {
      const h1 = rule.computeDedupHashes('tenant-A', { booking_ref: 'BK-001' }, KEY_SET);
      const h2 = rule.computeDedupHashes('tenant-B', { booking_ref: 'BK-001' }, KEY_SET);

      expect(h1[0]).not.toBe(h2[0]);
    });

    it('produces different hashes for different keys (booking_ref ≠ full_name)', () => {
      const profile = { booking_ref: 'same-value', full_name: 'same-value' };
      const hashes = rule.computeDedupHashes(TENANT_ID, profile, KEY_SET);

      // Same value, different key → different hash (key is included in input)
      expect(hashes[0]).not.toBe(hashes[1]);
    });

    it('returns hashes only for keys present in the keySet, ignoring others', () => {
      const hashes = rule.computeDedupHashes(TENANT_ID, {
        booking_ref: 'BK-001',
        full_name: 'Raj',
        employee_id: 'EMP-999', // not in keySet — must be ignored
      }, KEY_SET);

      expect(hashes).toHaveLength(2);
    });

    it('works with Phase 2 govt key set (employee_id, mobile)', () => {
      const govtKeySet = { match_any: ['employee_id', 'mobile'] };
      const hashes = rule.computeDedupHashes(TENANT_ID, {
        employee_id: 'EMP-001',
        mobile: '+919876543210',
      }, govtKeySet);

      expect(hashes).toHaveLength(2);
      expect(hashes[0]).toBe(expectedHash(TENANT_ID, 'employee_id', 'EMP-001'));
    });
  });

  describe('computePrimaryHash', () => {
    it('returns the hash of the first key with a non-empty value', () => {
      const primary = rule.computePrimaryHash(TENANT_ID, {
        booking_ref: 'BK-001',
        full_name: 'Raj',
      }, KEY_SET);

      expect(primary).toBe(expectedHash(TENANT_ID, 'booking_ref', 'BK-001'));
    });

    it('returns the second key hash if the first key is empty', () => {
      const primary = rule.computePrimaryHash(TENANT_ID, {
        booking_ref: '',
        full_name: 'Raj Kumar',
      }, KEY_SET);

      expect(primary).toBe(expectedHash(TENANT_ID, 'full_name', 'Raj Kumar'));
    });

    it('returns null when all matching keys are empty', () => {
      const primary = rule.computePrimaryHash(TENANT_ID, {}, KEY_SET);
      expect(primary).toBeNull();
    });
  });
});
