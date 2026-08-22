import type { StaffPresenceEntry } from '@hotel-app/core';

/**
 * PresenceManager — tracks connected staff and guest sockets.
 *
 * In-memory for the single-instance pilot. Phase 2 (horizontal scaling)
 * would back this with Redis pub/sub for cross-instance presence.
 *
 * Implements the PresenceStore interface from @hotel-app/core so it can
 * be used directly with DepartmentRoundRobinStrategy.
 */
export class PresenceManager {
  // tenant:department → Set<StaffPresenceEntry>
  private readonly staffMap = new Map<string, StaffPresenceEntry[]>();
  // identityId → socketId (guest)
  private readonly guestMap = new Map<string, string>();

  // ─── Staff ─────────────────────────────────────────────────────────────────

  addStaff(tenantId: string, department: string, entry: StaffPresenceEntry): void {
    const key = `${tenantId}:${department}`;
    const existing = this.staffMap.get(key) ?? [];
    existing.push(entry);
    this.staffMap.set(key, existing);
  }

  removeStaff(tenantId: string, department: string, socketId: string): void {
    const key = `${tenantId}:${department}`;
    const existing = this.staffMap.get(key) ?? [];
    this.staffMap.set(
      key,
      existing.filter((e) => e.socketId !== socketId),
    );
  }

  async getAvailableStaff(
    tenantId: string,
    department: string,
  ): Promise<StaffPresenceEntry[]> {
    const key = `${tenantId}:${department}`;
    return this.staffMap.get(key) ?? [];
  }

  getStaffCount(tenantId: string, department: string): number {
    const key = `${tenantId}:${department}`;
    return this.staffMap.get(key)?.length ?? 0;
  }

  // ─── Guests ────────────────────────────────────────────────────────────────

  addGuest(identityId: string, socketId: string): void {
    this.guestMap.set(identityId, socketId);
  }

  removeGuest(identityId: string): void {
    this.guestMap.delete(identityId);
  }

  getGuestSocket(identityId: string): string | undefined {
    return this.guestMap.get(identityId);
  }
}
