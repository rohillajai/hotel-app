import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AccessService } from './access.service';

/**
 * GrantExpiryJob — runs every 5 minutes to auto-expire time-boxed grants.
 *
 * Uses the partial index idx_grant_expiry on access_grants(valid_until, status)
 * WHERE valid_until IS NOT NULL — so the query only hits time-boxed grants,
 * never touching indefinite (Phase 2) grants.
 *
 * Idempotent: revokeGrant checks status before updating, so double-invocations
 * are safe (the second attempt for an already-revoked grant logs a warning and moves on).
 */
@Injectable()
export class GrantExpiryJob {
  private readonly logger = new Logger(GrantExpiryJob.name);

  constructor(private readonly accessService: AccessService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleExpiry() {
    const start = Date.now();
    try {
      const count = await this.accessService.expireGrants();
      const durationMs = Date.now() - start;
      if (count > 0) {
        this.logger.log(`Expiry job completed: ${count} grants expired in ${durationMs}ms`);
      }
    } catch (err) {
      this.logger.error('Expiry job failed', (err as Error).stack);
    }
  }
}
