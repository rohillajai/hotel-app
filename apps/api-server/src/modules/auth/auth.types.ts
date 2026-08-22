import type { EntityType } from '@hotel-app/db';

/**
 * Shape of the JWT access token payload.
 * Kept minimal — only what every service needs on every request.
 */
export interface JwtPayload {
  /** identity_records.id */
  sub: string;
  tenant_id: string;
  entity_type: EntityType;
  /** Room number for guests — used by signaling server to show to staff */
  room?: string;
  /** Active privileges from the access grant */
  grants: string[];
  iat?: number;
  exp?: number;
}

/**
 * The object attached to request.user after JWT validation.
 * Same shape as JwtPayload but all fields guaranteed present.
 */
export interface AuthenticatedUser {
  identityId: string;
  tenantId: string;
  entityType: EntityType;
  room?: string;
  grants: string[];
}
