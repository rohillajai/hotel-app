import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '../../modules/auth/auth.types';

/**
 * @TenantId() — injects the tenant_id from the authenticated user.
 *
 * Usage:
 *   @Get('guests')
 *   listGuests(@TenantId() tenantId: string) { ... }
 */
export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return request.user.tenantId;
  },
);
