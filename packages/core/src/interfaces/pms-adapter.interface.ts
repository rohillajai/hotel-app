/**
 * IPmsAdapter — pluggable Property Management System integration
 *
 * Phase 1 implementation: ManualEntryPmsAdapter
 *   lookupBooking always returns null — staff verifies the booking reference manually.
 *
 * Future implementations:
 *   EzeeAdapter       — eZee Centrix API
 *   StayflexiAdapter  — Stayflexi API
 *   HotelogixAdapter  — Hotelogix API
 *   IdsNextAdapter    — IDS Next API
 *
 * The adapter interface is the only contract between the identity/check-in
 * service and the PMS. Adding a new PMS never touches core code.
 */

export interface BookingLookupRequest {
  bookingRef: string;
  /** Optional — used as a secondary hint if the PMS supports name lookup */
  guestName?: string;
  tenantId: string;
}

export type BookingStatus =
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'CHECKED_OUT'
  | 'CANCELLED'
  | 'NO_SHOW';

export interface BookingRecord {
  bookingRef: string;
  guestName: string;
  roomNumber: string;
  checkInDate: Date;
  checkOutDate: Date;
  status: BookingStatus;
  /** Raw response from the PMS — stored in identity_records.profile.pms_raw for audit */
  rawData?: Record<string, unknown>;
}

export interface IPmsAdapter {
  /**
   * Look up a booking by reference and optionally guest name.
   * Returns null when:
   *   - The booking ref is not found
   *   - The PMS is unavailable (isAvailable() = false)
   *   - The adapter is the ManualEntryAdapter (no PMS configured)
   * Never throws for a not-found — only throws for unexpected errors.
   */
  lookupBooking(req: BookingLookupRequest): Promise<BookingRecord | null>;

  /**
   * Health-check. Returns false when no PMS is configured (Phase 1 pilot)
   * or when the PMS API is unreachable.
   */
  isAvailable(): Promise<boolean>;

  /** Human-readable name shown in admin settings */
  readonly adapterName: string;
}
