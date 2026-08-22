import { z } from 'zod';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Coerce a string env var to boolean. Accepts "true" / "1" / "yes". */
const booleanFromString = z
  .string()
  .transform((v) => ['true', '1', 'yes'].includes(v.toLowerCase()))
  .or(z.boolean());

/** Coerce a string env var to a positive integer. */
const positiveIntFromString = z
  .string()
  .regex(/^\d+$/, 'Must be a positive integer')
  .transform(Number)
  .or(z.number().int().positive());

// ─── Schema ───────────────────────────────────────────────────────────────────

const AppConfigSchema = z
  .object({
    // Runtime
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: positiveIntFromString.default('3001'),

    // Database
    DATABASE_URL: z
      .string()
      .url('DATABASE_URL must be a valid PostgreSQL connection string')
      .startsWith('postgresql://', 'DATABASE_URL must start with postgresql://'),

    // Redis
    REDIS_URL: z
      .string()
      .url('REDIS_URL must be a valid connection string')
      .default('redis://localhost:6379'),

    // JWT
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

    // AWS
    AWS_REGION: z.string().default('ap-south-1'),
    AWS_ACCESS_KEY_ID: z.string().optional().transform(v => v || undefined),
    AWS_SECRET_ACCESS_KEY: z.string().optional().transform(v => v || undefined),

    // S3 buckets
    S3_KYC_BUCKET: z.string().default('hotel-kyc-docs'),
    S3_ASSETS_BUCKET: z.string().default('hotel-app-assets'),
    S3_ENDPOINT: z.string().optional(), // Set to MinIO URL in local dev
    S3_SIGNED_URL_EXPIRES_SECONDS: positiveIntFromString.default('900'), // 15 min

    // AWS SNS
    SNS_OTP_TOPIC_ARN: z.string().optional().transform(v => v || undefined),

    // OTP
    OTP_BYPASS_ENABLED: booleanFromString.default('false'),
    OTP_BYPASS_CODE: z.string().default('123456'),
    OTP_EXPIRES_SECONDS: positiveIntFromString.default('600'), // 10 min
    OTP_MAX_ATTEMPTS: positiveIntFromString.default('5'),
    OTP_RATE_WINDOW_SECONDS: positiveIntFromString.default('600'),

    // coturn / TURN
    COTURN_HOST: z.string().default('localhost'),
    COTURN_PORT: positiveIntFromString.default('3478'),
    COTURN_SECRET: z.string().min(8, 'COTURN_SECRET must be at least 8 characters'),
    COTURN_REALM: z.string().default('turn.localhost'),
    TURN_CREDENTIAL_TTL_SECONDS: positiveIntFromString.default('3600'), // 1 hour

    // Web Push / VAPID
    VAPID_PUBLIC_KEY: z.string().optional().transform(v => v || undefined),
    VAPID_PRIVATE_KEY: z.string().optional().transform(v => v || undefined),
    VAPID_SUBJECT: z.string().email().optional().or(z.literal('')).transform(v => v || undefined),

    // Signaling server
    SIGNALING_SERVER_URL: z.string().url().default('http://localhost:3002'),
    SIGNALING_INTERNAL_SECRET: z
      .string()
      .min(32, 'SIGNALING_INTERNAL_SECRET must be at least 32 characters')
      .optional(),

    // CORS
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000,http://localhost:3003,http://localhost:3004')
      .transform((v) => v.split(',').map((s) => s.trim())),

    // Rate limiting
    THROTTLE_TTL_SECONDS: positiveIntFromString.default('60'),
    THROTTLE_LIMIT: positiveIntFromString.default('100'),
  })
  // ─── Production safety guards ─────────────────────────────────────────────
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      // OTP bypass must never be active in production
      if (data.OTP_BYPASS_ENABLED) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['OTP_BYPASS_ENABLED'],
          message: 'OTP_BYPASS_ENABLED must not be true in production — this is a security violation',
        });
      }

      // Real AWS credentials required in production (not needed locally with MinIO / mock SNS)
      if (!data.AWS_ACCESS_KEY_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AWS_ACCESS_KEY_ID'],
          message: 'AWS_ACCESS_KEY_ID is required in production',
        });
      }
      if (!data.AWS_SECRET_ACCESS_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AWS_SECRET_ACCESS_KEY'],
          message: 'AWS_SECRET_ACCESS_KEY is required in production',
        });
      }
      if (!data.SNS_OTP_TOPIC_ARN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SNS_OTP_TOPIC_ARN'],
          message: 'SNS_OTP_TOPIC_ARN is required in production',
        });
      }
      if (!data.VAPID_PUBLIC_KEY || !data.VAPID_PRIVATE_KEY || !data.VAPID_SUBJECT) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['VAPID_PUBLIC_KEY'],
          message: 'VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT are required in production',
        });
      }
      if (!data.SIGNALING_INTERNAL_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SIGNALING_INTERNAL_SECRET'],
          message: 'SIGNALING_INTERNAL_SECRET is required in production',
        });
      }
    }
  });

export type AppConfig = z.infer<typeof AppConfigSchema>;

// ─── Loader ───────────────────────────────────────────────────────────────────

let _config: AppConfig | null = null;

/**
 * Load, validate, and return typed application config from process.env.
 *
 * Throws a descriptive error if any required variable is missing or invalid.
 * Cached after first call — safe to call multiple times.
 */
export function loadConfig(): AppConfig {
  if (_config) return _config;

  const result = AppConfigSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`[config] Invalid environment variables:\n${issues}`);
  }

  _config = result.data;
  return _config;
}

/**
 * Reset the config cache. For use in tests only.
 * @internal
 */
export function _resetConfigCache(): void {
  _config = null;
}
