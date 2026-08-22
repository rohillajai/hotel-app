import type {
  ICallRoutingStrategy,
  CallRouteRequest,
  CallRouteResult,
} from '../interfaces/call-routing-strategy.interface';

/**
 * DepartmentRoundRobinStrategy
 *
 * Phase 1 implementation of ICallRoutingStrategy.
 * Selects any available staff socket in the requested department using
 * round-robin rotation to distribute calls evenly.
 *
 * Presence data comes from an injected PresenceStore — in production this
 * is backed by Redis (signaling server manages the presence map).
 * In tests it is a simple in-memory Map.
 *
 * Phase 2: swap for DirectoryLookupStrategy which resolves a specific
 * person by directory entry ID.
 */

export interface StaffPresenceEntry {
  socketId: string;
  identityId: string;
  department: string;
}

export interface PresenceStore {
  /** Returns all currently connected staff for a given tenant + department */
  getAvailableStaff(
    tenantId: string,
    department: string,
  ): Promise<StaffPresenceEntry[]>;
}

export class DepartmentRoundRobinStrategy implements ICallRoutingStrategy {
  readonly strategyName = 'DepartmentRoundRobin';

  // Per-department rotation counter — persists for the lifetime of the process
  private readonly counters = new Map<string, number>();

  constructor(private readonly presenceStore: PresenceStore) {}

  async route(req: CallRouteRequest): Promise<CallRouteResult | null> {
    if (!req.toDepartment) {
      return null; // Department-based routing requires toDepartment
    }

    const available = await this.presenceStore.getAvailableStaff(
      req.tenantId,
      req.toDepartment,
    );

    if (available.length === 0) return null;

    // Round-robin selection
    const key = `${req.tenantId}:${req.toDepartment}`;
    const counter = this.counters.get(key) ?? 0;
    const selected = available[counter % available.length]!;
    this.counters.set(key, counter + 1);

    return {
      calleeSocketId: selected.socketId,
      calleeIdentityId: selected.identityId,
      calleeDepartment: selected.department,
    };
  }
}
