import { Injectable, Inject } from '@nestjs/common';
import type { PrismaClient } from '@hotel-app/db';
import { PRISMA_TOKEN } from '../database/database.module';
import { OtpService } from './otp.service';
import { TokenService, type TokenPair } from './token.service';

@Injectable()
export class GuestAuthService {
  constructor(
    private readonly otpService: OtpService,
    private readonly tokenService: TokenService,
    @Inject(PRISMA_TOKEN) private readonly db: PrismaClient,
  ) {}

  async sendOtp(mobile: string): Promise<void> {
    await this.otpService.sendOtp(mobile);
  }

  /**
   * Verify OTP, upsert the guest identity record, and issue a token pair.
   * The identity record is created with PENDING status if it doesn't exist.
   * Activation (ACTIVE status + grant issuance) happens through the check-in flow.
   */
  async verifyOtp(
    mobile: string,
    otp: string,
    meta?: { userAgent?: string; ipAddress?: string },
  ): Promise<TokenPair & { identity_id: string; is_new: boolean }> {
    await this.otpService.verifyOtp(mobile, otp);

    // Find or create a GUEST identity record for this mobile number.
    // At this stage we only know the mobile — the booking ref is added in check-in.
    let identity = await this.db.identityRecord.findFirst({
      where: {
        profile: { path: ['mobile'], equals: mobile },
        entityType: 'GUEST',
        status: { not: 'REJECTED' },
      },
    });

    const isNew = !identity;

    if (!identity) {
      // Create a minimal identity. The tenant is determined at check-in.
      // For now we use a placeholder — the check-in flow will associate the
      // correct tenant and update the profile with booking details.
      // We use the first available tenant as a bootstrap (pilot has one tenant).
      const tenant = await this.db.tenant.findFirst({ orderBy: { createdAt: 'asc' } });
      if (!tenant) throw new Error('No tenant configured. Run the seed script first.');

      identity = await this.db.identityRecord.create({
        data: {
          tenantId: tenant.id,
          entityType: 'GUEST',
          status: 'PENDING',
          registrationPath: 'B',
          profile: { mobile },
        },
      });
    }

    // Build grants array from any active access grant
    const activeGrant = await this.db.accessGrant.findFirst({
      where: { subjectId: identity.id, status: 'ACTIVE' },
      select: { privileges: true },
    });

    const profile = identity.profile as Record<string, unknown>;
    const tokens = await this.tokenService.issueTokenPair(
      {
        sub: identity.id,
        tenant_id: identity.tenantId,
        entity_type: 'GUEST',
        room: profile['room_number'] as string | undefined,
        grants: activeGrant?.privileges ?? [],
      },
      meta,
    );

    return { ...tokens, identity_id: identity.id, is_new: isNew };
  }
}
