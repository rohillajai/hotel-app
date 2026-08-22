import Redis from 'ioredis';

/**
 * RateLimiter — sliding window counter for call rate limiting.
 * Default: 10 calls per 60-minute window per subject.
 *
 * Key format: ratelimit:call:{subjectId}
 * Uses Redis INCR + EXPIRE for atomic window management.
 */
export class RateLimiter {
  private readonly redis: Redis;
  private readonly maxCalls: number;
  private readonly windowSeconds: number;

  constructor(
    redisUrl: string,
    maxCalls = 10,
    windowSeconds = 3600, // 1 hour
  ) {
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
    this.maxCalls = maxCalls;
    this.windowSeconds = windowSeconds;

    this.redis.on('error', (err) => {
      console.error('[rate-limiter] Redis error:', err.message);
    });
  }

  /**
   * Check if a subject is allowed to initiate a call.
   * Returns { allowed: true } if under the limit.
   * Returns { allowed: false, retryAfter: seconds } if over the limit.
   */
  async checkCallRate(subjectId: string): Promise<{ allowed: boolean; retryAfter?: number }> {
    const key = `ratelimit:call:${subjectId}`;
    const count = await this.redis.incr(key);

    if (count === 1) {
      // First call in the window — set expiry
      await this.redis.expire(key, this.windowSeconds);
    }

    if (count > this.maxCalls) {
      const ttl = await this.redis.ttl(key);
      return { allowed: false, retryAfter: ttl > 0 ? ttl : this.windowSeconds };
    }

    return { allowed: true };
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}
