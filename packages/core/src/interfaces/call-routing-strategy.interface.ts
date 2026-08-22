/**
 * ICallRoutingStrategy — pluggable call routing logic
 *
 * Design.md §7.6 flag: Phase 1 routes calls to a department (round-robin
 * among available staff). Phase 2 routes to a specific person by directory
 * lookup (a PA calling "Joint Secretary, Dept X" directly).
 *
 * This interface isolates the routing decision so Phase 2 only adds a new
 * implementation — no changes to the signaling server core.
 *
 * Phase 1 implementation: DepartmentRoundRobinStrategy
 *   Picks any available staff socket in the requested department.
 *
 * Phase 2 implementation (not built):
 *   DirectoryLookupStrategy
 *   Resolves the callee by directory entry ID, looks up their socket.
 */

export interface CallRouteRequest {
  tenantId: string;
  callerIdentityId: string;
  /** Phase 1: department slug e.g. 'RECEPTION' */
  toDepartment?: string;
  /** Phase 2: specific directory entry ID */
  toDirectoryEntryId?: string;
}

export interface CallRouteResult {
  /** Socket ID of the selected callee */
  calleeSocketId: string;
  /** Identity ID of the selected callee — stored in call_logs.callee_id */
  calleeIdentityId: string;
  /** Department of the selected callee */
  calleeDepartment: string;
}

export interface ICallRoutingStrategy {
  /**
   * Select a callee for an incoming call request.
   * Returns null when no staff are available (caller gets NO_STAFF_AVAILABLE error).
   */
  route(req: CallRouteRequest): Promise<CallRouteResult | null>;

  readonly strategyName: string;
}
