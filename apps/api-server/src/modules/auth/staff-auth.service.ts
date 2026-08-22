import {
  Injectable,
  Inject,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { PrismaClient } from '@hotel-app/db';
import { PRISMA_TOKEN } from '../database/database.module';
import { TokenService, type TokenPair } from './token.service';

@Injectable()
export class StaffAuthService {
  constructor(
    private readonly tokenService: TokenService,
    @Inject(PRISMA_TOKEN) private readonly db: PrismaClient,
  ) {}

  async login(
    email: string,
    password: string,
    meta?: { userAgent?: string; ipAddress?: string },
  ): Promise<TokenPair & { identity_id: string }> {
    // Find identity record by email in the profile JSONB
    const identity = await this.db.identityRecord.findFirst({
      where: {
        profile: { path: ['email'], equals: email },
        entityType: { in: ['STAFF', 'ADMIN'] },
        status: 'ACTIVE',
      },
    });

    if (!identity) throw new UnauthorizedException('Invalid email or password.');

    const profile = identity.profile as Record<string, unknown>;
    const passwordHash = profile['password_hash'] as string | undefined;

    if (!passwordHash) throw new UnauthorizedException('Invalid email or password.');

    const valid = await bcrypt.compare(password, passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid email or password.');

    // Check the identity is not deactivated
    if (identity.status === 'DEACTIVATED') {
      throw new ForbiddenException('This account has been deactivated.');
    }

    const tokens = await this.tokenService.issueTokenPair(
      {
        sub: identity.id,
        tenant_id: identity.tenantId,
        entity_type: identity.entityType,
        grants: ['STAFF_ACCESS'],
      },
      meta,
    );

    return { ...tokens, identity_id: identity.id };
  }
}
