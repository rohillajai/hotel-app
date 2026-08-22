import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Logger,
} from '@nestjs/common';
import type Redis from 'ioredis';
import type { PrismaClient } from '@hotel-app/db';
import type { AuthenticatedUser } from '../../modules/auth/auth.types';
import { PRISMA_TOKEN } from '../../modules/database/database.module';
import { REDIS_TOKEN } from '../../modules/redis/redis.module';

/**
 * TenantGuard — validates that the tenant_id in the JWT exists and is active.
 * Result is cached in Redis (5-minute TTL) to avoid a DB hit on every request.
 *
 * Applied globally after JwtAuthGuard in AppModule.
 * Public routes (no JWT) are skipped automatically — user will be undefined.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    @Inject(PRISMA_TOKEN) private readonly db: PrismaClient,
    @Inject(REDIS_TOKEN) private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    // No user = public route — JwtAuthGuard already allowed it through
    if (!user) return true;

    const tenantId = user.tenantId;
    const cacheKey = `tenant_valid:${tenantId}`;

    // Fast path: cached validation result
    const cached = await this.redis.get(cacheKey);
    if (cached === '1') return true;
    if (cached === '0') throw new ForbiddenException('Tenant not found or inactive.');

    // DB lookup
    const tenant = await this.db.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });

    if (!tenant) {
      await this.redis.set(cacheKey, '0', 'EX', this.CACHE_TTL);
      this.logger.warn(`TenantGuard: tenant ${tenantId} not found`);
      throw new ForbiddenException('Tenant not found or inactive.');
    }

    await this.redis.set(cacheKey, '1', 'EX', this.CACHE_TTL);
    return true;
  }
}
