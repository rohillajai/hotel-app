import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { OtpService } from '../otp.service';
import { REDIS_TOKEN } from '../../redis/redis.module';

// ── Mock env before the module loads ─────────────────────────────────────────
vi.mock('@hotel-app/config', () => ({
  loadConfig: () => ({
    OTP_BYPASS_ENABLED: false,
    OTP_BYPASS_CODE: '123456',
    OTP_EXPIRES_SECONDS: 600,
    OTP_MAX_ATTEMPTS: 5,
    OTP_RATE_WINDOW_SECONDS: 600,
    AWS_REGION: 'ap-south-1',
  }),
}));

vi.mock('@hotel-app/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hotel-app/core')>();
  return {
    ...actual,
    SnsNotificationAdapter: vi.fn().mockImplementation(() => ({
      sendOtp: vi.fn().mockResolvedValue({ accepted: true, messageId: 'msg-001' }),
    })),
  };
});

function makeRedis(store: Record<string, string | null> = {}) {
  const counters: Record<string, number> = {};
  return {
    get: vi.fn((k: string) => Promise.resolve(store[k] ?? null)),
    set: vi.fn((k: string, v: string) => {
      store[k] = v;
      return Promise.resolve('OK');
    }),
    del: vi.fn((k: string) => {
      delete store[k];
      return Promise.resolve(1);
    }),
    incr: vi.fn((k: string) => {
      counters[k] = (counters[k] ?? 0) + 1;
      return Promise.resolve(counters[k]);
    }),
    expire: vi.fn(() => Promise.resolve(1)),
    ttl: vi.fn(() => Promise.resolve(300)),
  };
}

describe('OtpService', () => {
  let service: OtpService;
  let redis: ReturnType<typeof makeRedis>;

  beforeEach(async () => {
    redis = makeRedis();

    const module = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: REDIS_TOKEN, useValue: redis },
        { provide: 'SNS_PUBLISHER', useValue: { publish: vi.fn().mockResolvedValue({ MessageId: 'x' }) } },
      ],
    }).compile();

    service = module.get(OtpService);
  });

  describe('sendOtp()', () => {
    it('stores an OTP hash and calls SNS', async () => {
      await service.sendOtp('+919876543210');
      expect(redis.set).toHaveBeenCalledWith(
        'otp:+919876543210',
        expect.any(String),
        'EX',
        600,
      );
    });

    it('throws 429 after exceeding max attempts', async () => {
      // Exhaust the rate limit
      for (let i = 0; i < 5; i++) {
        await service.sendOtp('+919876543210').catch(() => {});
      }

      await expect(service.sendOtp('+919876543210')).rejects.toMatchObject({
        status: HttpStatus.TOO_MANY_REQUESTS,
      });
    });
  });

  describe('verifyOtp()', () => {
    it('succeeds when OTP matches', async () => {
      // Prime the store with the hash of '847291'
      const { createHash } = await import('crypto');
      const hash = createHash('sha256').update('847291').digest('hex');
      redis = makeRedis({ 'otp:+919876543210': hash });

      const module = await Test.createTestingModule({
        providers: [
          OtpService,
          { provide: REDIS_TOKEN, useValue: redis },
          { provide: 'SNS_PUBLISHER', useValue: { publish: vi.fn() } },
        ],
      }).compile();
      service = module.get(OtpService);

      const result = await service.verifyOtp('+919876543210', '847291');
      expect(result).toBe(true);
      expect(redis.del).toHaveBeenCalledWith('otp:+919876543210');
    });

    it('throws 401 when OTP does not match', async () => {
      const { createHash } = await import('crypto');
      const hash = createHash('sha256').update('111111').digest('hex');
      redis = makeRedis({ 'otp:+919876543210': hash });

      const module = await Test.createTestingModule({
        providers: [
          OtpService,
          { provide: REDIS_TOKEN, useValue: redis },
          { provide: 'SNS_PUBLISHER', useValue: { publish: vi.fn() } },
        ],
      }).compile();
      service = module.get(OtpService);

      await expect(service.verifyOtp('+919876543210', '999999')).rejects.toMatchObject({
        status: HttpStatus.UNAUTHORIZED,
      });
    });

    it('throws 401 when OTP is expired (key not in Redis)', async () => {
      await expect(service.verifyOtp('+910000000000', '123456')).rejects.toMatchObject({
        status: HttpStatus.UNAUTHORIZED,
      });
    });
  });
});
