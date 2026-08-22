import {
  Injectable,
  Inject,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { createHash, randomInt } from 'crypto';
import type Redis from 'ioredis';
import { loadConfig } from '@hotel-app/config';
import {
  SnsNotificationAdapter,
  type SnsPublisher,
} from '@hotel-app/core';
import { NotificationDeliveryError } from '@hotel-app/core';
import { REDIS_TOKEN } from '../redis/redis.module';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly config = loadConfig();
  private readonly adapter: SnsNotificationAdapter;

  constructor(
    @Inject(REDIS_TOKEN) private readonly redis: Redis,
    @Inject('SNS_PUBLISHER') private readonly snsPublisher: SnsPublisher,
  ) {
    this.adapter = new SnsNotificationAdapter(this.snsPublisher, {
      otpBypassEnabled: this.config.OTP_BYPASS_ENABLED,
    });
  }

  /**
   * Generate and send an OTP to the given mobile number.
   * Rate-limited: max OTP_MAX_ATTEMPTS sends per OTP_RATE_WINDOW_SECONDS.
   */
  async sendOtp(mobile: string): Promise<void> {
    await this.checkRateLimit(mobile);

    const otp = this.config.OTP_BYPASS_ENABLED
      ? this.config.OTP_BYPASS_CODE
      : this.generateOtp();

    // Store SHA-256 hash of OTP (not plaintext) with TTL
    const otpHash = createHash('sha256').update(otp).digest('hex');
    const key = this.otpKey(mobile);
    await this.redis.set(key, otpHash, 'EX', this.config.OTP_EXPIRES_SECONDS);

    try {
      await this.adapter.sendOtp({ mobile, otp });
    } catch (err) {
      // Clean up the stored OTP on delivery failure — don't leave a dangling entry
      await this.redis.del(key);
      if (err instanceof NotificationDeliveryError) {
        this.logger.error(`OTP delivery failed for ${mobile}: ${err.message}`);
        throw new InternalServerErrorException('Failed to send OTP. Please try again.');
      }
      throw err;
    }
  }

  /**
   * Verify an OTP for the given mobile.
   * Deletes the OTP entry on success (one-time use).
   * Returns true on success, throws UnauthorizedException on failure.
   */
  async verifyOtp(mobile: string, otp: string): Promise<true> {
    const key = this.otpKey(mobile);
    const storedHash = await this.redis.get(key);

    if (!storedHash) {
      throw new UnauthorizedException('OTP expired or not found. Please request a new OTP.');
    }

    const incomingHash = createHash('sha256').update(otp).digest('hex');

    if (incomingHash !== storedHash) {
      throw new UnauthorizedException('Invalid OTP.');
    }

    // Delete on successful verification (one-time use)
    await this.redis.del(key);
    return true;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private generateOtp(): string {
    return randomInt(100000, 999999).toString();
  }

  private otpKey(mobile: string): string {
    return `otp:${mobile}`;
  }

  private rateLimitKey(mobile: string): string {
    return `otp_rate:${mobile}`;
  }

  private async checkRateLimit(mobile: string): Promise<void> {
    const key = this.rateLimitKey(mobile);
    const attempts = await this.redis.incr(key);

    if (attempts === 1) {
      // First attempt — set the window expiry
      await this.redis.expire(key, this.config.OTP_RATE_WINDOW_SECONDS);
    }

    if (attempts > this.config.OTP_MAX_ATTEMPTS) {
      const ttl = await this.redis.ttl(key);
      throw new HttpException(
        `Too many OTP requests. Try again in ${ttl} seconds.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
