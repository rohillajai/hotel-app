import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, _resetConfigCache } from '../app-config';

// Minimal valid env for development
const BASE_ENV: Record<string, string> = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  COTURN_SECRET: 'localturnsecret',
};

function withEnv(overrides: Record<string, string | undefined>, fn: () => void) {
  const original: Record<string, string | undefined> = {};

  // Save & set
  for (const [k, v] of Object.entries({ ...BASE_ENV, ...overrides })) {
    original[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }

  try {
    fn();
  } finally {
    // Restore
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
}

describe('loadConfig()', () => {
  beforeEach(() => {
    _resetConfigCache();
  });

  afterEach(() => {
    _resetConfigCache();
  });

  it('loads valid dev config without throwing', () => {
    withEnv({}, () => {
      const config = loadConfig();
      expect(config.NODE_ENV).toBe('development');
      expect(config.PORT).toBe(3001);
    });
  });

  it('throws a descriptive error when DATABASE_URL is missing', () => {
    withEnv({ DATABASE_URL: undefined }, () => {
      expect(() => loadConfig()).toThrowError(/DATABASE_URL/);
    });
  });

  it('throws when JWT_SECRET is shorter than 32 characters', () => {
    withEnv({ JWT_SECRET: 'tooshort' }, () => {
      expect(() => loadConfig()).toThrowError(/JWT_SECRET/);
    });
  });

  it('throws when OTP_BYPASS_ENABLED=true in production', () => {
    withEnv(
      {
        NODE_ENV: 'production',
        OTP_BYPASS_ENABLED: 'true',
        AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
        AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        SNS_OTP_TOPIC_ARN: 'arn:aws:sns:ap-south-1:123456789012:otp',
        VAPID_PUBLIC_KEY: 'BPublicKey',
        VAPID_PRIVATE_KEY: 'BPrivateKey',
        VAPID_SUBJECT: 'mailto:test@example.com',
        SIGNALING_INTERNAL_SECRET: 'c'.repeat(32),
      },
      () => {
        expect(() => loadConfig()).toThrowError(/OTP_BYPASS_ENABLED/);
      },
    );
  });

  it('throws when AWS credentials are missing in production', () => {
    withEnv(
      {
        NODE_ENV: 'production',
        OTP_BYPASS_ENABLED: 'false',
        AWS_ACCESS_KEY_ID: undefined,
        AWS_SECRET_ACCESS_KEY: undefined,
        SNS_OTP_TOPIC_ARN: 'arn:aws:sns:ap-south-1:123456789012:otp',
        VAPID_PUBLIC_KEY: 'BPublicKey',
        VAPID_PRIVATE_KEY: 'BPrivateKey',
        VAPID_SUBJECT: 'mailto:test@example.com',
        SIGNALING_INTERNAL_SECRET: 'c'.repeat(32),
      },
      () => {
        expect(() => loadConfig()).toThrowError(/AWS_ACCESS_KEY_ID/);
      },
    );
  });

  it('parses CORS_ORIGINS as an array', () => {
    withEnv(
      { CORS_ORIGINS: 'http://localhost:3000,http://localhost:3003' },
      () => {
        const config = loadConfig();
        expect(config.CORS_ORIGINS).toEqual([
          'http://localhost:3000',
          'http://localhost:3003',
        ]);
      },
    );
  });

  it('coerces PORT from string to number', () => {
    withEnv({ PORT: '4000' }, () => {
      const config = loadConfig();
      expect(config.PORT).toBe(4000);
      expect(typeof config.PORT).toBe('number');
    });
  });

  it('defaults OTP_BYPASS_ENABLED to false when not set', () => {
    withEnv({ OTP_BYPASS_ENABLED: undefined }, () => {
      const config = loadConfig();
      expect(config.OTP_BYPASS_ENABLED).toBe(false);
    });
  });

  it('is cached after first call', () => {
    withEnv({}, () => {
      const first = loadConfig();
      const second = loadConfig();
      expect(first).toBe(second); // same reference
    });
  });
});
