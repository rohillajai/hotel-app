import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../modules/auth/auth.types';

/**
 * TenantContext — request-scoped provider.
 * Inject into any service to access the current user and tenant ID
 * without threading them through every method call.
 *
 * Usage:
 *   constructor(private readonly ctx: TenantContext) {}
 *   const tenantId = this.ctx.tenantId;
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  constructor(
    @Inject(REQUEST) private readonly request: Request & { user?: AuthenticatedUser },
  ) {}

  get user(): AuthenticatedUser {
    if (!this.request.user) {
      throw new Error(
        'TenantContext.user accessed before authentication. ' +
          'Ensure JwtAuthGuard runs before this service.',
      );
    }
    return this.request.user;
  }

  get tenantId(): string {
    return this.user.tenantId;
  }

  get identityId(): string {
    return this.user.identityId;
  }

  get entityType(): string {
    return this.user.entityType;
  }
}
