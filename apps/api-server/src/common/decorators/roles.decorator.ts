import { SetMetadata } from '@nestjs/common';
import type { EntityType } from '@hotel-app/db';

export const ROLES_KEY = 'roles';

/**
 * @Roles('ADMIN', 'STAFF') — restricts an endpoint to specific entity types.
 * Used with RolesGuard.
 *
 * Usage:
 *   @Roles('ADMIN')
 *   @Get('settings')
 *   getSettings() { ... }
 */
export const Roles = (...roles: EntityType[]) => SetMetadata(ROLES_KEY, roles);
