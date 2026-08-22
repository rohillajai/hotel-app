import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import type { PrismaClient } from '@hotel-app/db';
import { loadConfig } from '@hotel-app/config';
import type { JwtPayload, AuthenticatedUser } from './auth.types';
import { PRISMA_TOKEN } from '../database/database.module';

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
}

@Injectable()
export class TokenService {
  private readonly config = loadConfig();

  constructor(
    private readonly jwtService: JwtService,
    @Inject(PRISMA_TOKEN) private readonly db: PrismaClient,
  ) {}

  /** Issue a new access + refresh token pair for a given identity */
  async issueTokenPair(
    payload: Omit<JwtPayload, 'iat' | 'exp'>,
    meta?: { userAgent?: string; ipAddress?: string },
  ): Promise<TokenPair> {
    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.JWT_SECRET,
      expiresIn: this.config.JWT_ACCESS_EXPIRES_IN,
    });

    // Raw refresh token — never stored, only its hash is persisted
    const rawRefreshToken = randomBytes(48).toString('hex');
    const tokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await this.db.refreshToken.create({
      data: {
        subjectId: payload.sub,
        tokenHash,
        expiresAt,
        userAgent: meta?.userAgent?.slice(0, 500),
        ipAddress: meta?.ipAddress?.slice(0, 45),
      },
    });

    return {
      access_token: accessToken,
      refresh_token: rawRefreshToken,
      expires_in: 15 * 60, // 15 minutes in seconds
    };
  }

  /**
   * Validate a raw refresh token and issue a new access token.
   * Rotates the refresh token: old one is revoked, new one issued.
   */
  async refreshAccessToken(
    rawRefreshToken: string,
    meta?: { userAgent?: string; ipAddress?: string },
  ): Promise<TokenPair> {
    const tokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');

    const stored = await this.db.refreshToken.findUnique({
      where: { tokenHash },
      include: { subject: true },
    });

    if (!stored) throw new UnauthorizedException('Invalid refresh token');
    if (stored.revokedAt) throw new UnauthorizedException('Refresh token has been revoked');
    if (stored.expiresAt < new Date()) throw new UnauthorizedException('Refresh token has expired');

    // Revoke the old token (rotation)
    await this.db.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const profile = stored.subject.profile as Record<string, unknown>;
    const grants = await this.getActiveGrants(stored.subjectId);

    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: stored.subjectId,
      tenant_id: stored.subject.tenantId,
      entity_type: stored.subject.entityType,
      room: profile['room_number'] as string | undefined,
      grants,
    };

    return this.issueTokenPair(payload, meta);
  }

  /** Revoke a single refresh token (logout) */
  async revokeToken(rawRefreshToken: string): Promise<void> {
    const tokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');
    await this.db.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revoke ALL active refresh tokens for a subject (used on grant revocation / checkout) */
  async revokeAllTokensForSubject(subjectId: string): Promise<void> {
    await this.db.refreshToken.updateMany({
      where: { subjectId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Extract AuthenticatedUser from a validated JWT payload */
  payloadToUser(payload: JwtPayload): AuthenticatedUser {
    return {
      identityId: payload.sub,
      tenantId: payload.tenant_id,
      entityType: payload.entity_type,
      room: payload.room,
      grants: payload.grants,
    };
  }

  private async getActiveGrants(subjectId: string): Promise<string[]> {
    const grant = await this.db.accessGrant.findFirst({
      where: { subjectId, status: 'ACTIVE' },
      select: { privileges: true },
    });
    return grant?.privileges ?? [];
  }
}
