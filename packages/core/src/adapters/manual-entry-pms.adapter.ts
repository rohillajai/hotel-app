import type { IPmsAdapter, BookingLookupRequest, BookingRecord } from '../interfaces/pms-adapter.interface';

/**
 * ManualEntryPmsAdapter
 *
 * Phase 1 implementation of IPmsAdapter — no PMS integration for the pilot.
 *
 * lookupBooking always returns null. The check-in flow treats a null result
 * as "PMS unavailable — staff must verify booking reference manually."
 * In STAFF_CONFIRM mode this is the normal path; in AUTO_APPROVE mode the
 * system will fall back to approving based on the guest-entered booking ref
 * alone (staff can still reject at check-in review).
 *
 * isAvailable returns false so the admin settings page shows "No PMS configured".
 *
 * Future: swap this binding for EzeeAdapter, StayflexiAdapter etc.
 * The concrete adapter implements lookupBooking() against the PMS API.
 */
export class ManualEntryPmsAdapter implements IPmsAdapter {
  readonly adapterName = 'ManualEntry (No PMS)';

  async lookupBooking(_req: BookingLookupRequest): Promise<BookingRecord | null> {
    // No PMS configured for the pilot — staff verifies the booking ref manually.
    return null;
  }

  async isAvailable(): Promise<boolean> {
    return false;
  }
}
