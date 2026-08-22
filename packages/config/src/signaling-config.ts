import { z } from 'zod';

const positiveIntFromString = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .or(z.number().int().positive());

const SignalingConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: positiveIntFromString.default('3002'),

  // Auth — signaling server validates the same JWTs as the API server
  JWT_SECRET: z.string().min(32),

  // Internal API calls back to api-server
  API_SERVER_URL: z.string().url().default('http://localhost:3001'),
  SIGNALING_INTERNAL_SECRET: z.string().min(32).optional(),

  // Redis — for presence map and rate limiting
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  // coturn credentials (for issuing time-limited TURN creds to clients)
  COTURN_HOST: z.string().default('localhost'),
  COTURN_PORT: positiveIntFromString.default('3478'),
  COTURN_SECRET: z.string().min(8),
  COTURN_REALM: z.string().default('turn.localhost'),
  TURN_CREDENTIAL_TTL_SECONDS: positiveIntFromString.default('3600'),

  // CORS
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:3003,http://localhost:3004')
    .transform((v) => v.split(',').map((s) => s.trim())),
});

export type SignalingConfig = z.infer<typeof SignalingConfigSchema>;

let _config: SignalingConfig | null = null;

export function loadSignalingConfig(): SignalingConfig {
  if (_config) return _config;

  const result = SignalingConfigSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`[signaling-config] Invalid environment variables:\n${issues}`);
  }

  _config = result.data;
  return _config;
}

export function _resetSignalingConfigCache(): void {
  _config = null;
}
