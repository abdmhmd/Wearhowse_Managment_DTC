import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL environment variable is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGINS: z.string().min(1, 'CORS_ORIGINS is required'),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(() => (process.env.NODE_ENV === 'production' ? 15 * 60 * 1000 : 10 * 1000)),
  /**
   * PostgreSQL TLS (Aiven / cloud) switches. Local development keeps
   * DB_SSL=false; Aiven for PostgreSQL sets DB_SSL=true and, for cert
   * verification, DB_SSL_CA_PATH pointing at the downloaded ca.pem.
   */
  DB_SSL: z.string().default('false'),
  DB_SSL_REJECT_UNAUTHORIZED: z.string().default('true'),
  DB_SSL_CA_PATH: z.string().default(''),
});

type EnvSchema = z.infer<typeof envSchema>;

const INSECURE_JWT_SECRET = 'change_this_to_a_secure_random_secret_in_production';
const INSECURE_JWT_REFRESH_SECRET = 'change_this_to_a_different_secure_random_secret';

/**
 * Startup guard. Throws a hard error (aborting boot) when the environment is
 * known to be insecure:
 *   - JWT secrets are still set to the placeholder values shipped in .env.example
 *   - NODE_ENV=production points DATABASE_URL at localhost / 127.0.0.1
 * Call this in the server entrypoint AFTER validateEnv() and BEFORE app.listen().
 */
export function assertSafeEnv(): void {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const jwtSecret = process.env.JWT_SECRET;
  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
  const dbUrl = process.env.DATABASE_URL;

  const problems: string[] = [];

  if (jwtSecret === INSECURE_JWT_SECRET) {
    problems.push('JWT_SECRET is still the insecure placeholder value');
  }
  if (jwtRefreshSecret === INSECURE_JWT_REFRESH_SECRET) {
    problems.push('JWT_REFRESH_SECRET is still the insecure placeholder value');
  }

  if (nodeEnv === 'production' && dbUrl) {
    let hostname = '';
    try {
      hostname = new URL(dbUrl).hostname;
    } catch {
      hostname = dbUrl;
    }
    if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)$/i.test(hostname)) {
      problems.push('DATABASE_URL points to localhost/loopback while NODE_ENV=production');
    }
  }

  if (problems.length > 0) {
    throw new Error(`Refusing to start server (unsafe environment): ${problems.join('; ')}`);
  }
}

let parsedEnv: EnvSchema | null = null;

export function validateEnv(): EnvSchema {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formattedErrors = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Missing or invalid required environment variables: ${formattedErrors}`);
  }
  parsedEnv = result.data;
  return parsedEnv;
}

export const env = {
  get DATABASE_URL(): string {
    return (parsedEnv || validateEnv()).DATABASE_URL;
  },
  get JWT_SECRET(): string {
    return (parsedEnv || validateEnv()).JWT_SECRET;
  },
  get JWT_REFRESH_SECRET(): string {
    return (parsedEnv || validateEnv()).JWT_REFRESH_SECRET;
  },
  get JWT_EXPIRES_IN(): string {
    return (parsedEnv || validateEnv()).JWT_EXPIRES_IN;
  },
  get JWT_REFRESH_EXPIRES_IN(): string {
    return (parsedEnv || validateEnv()).JWT_REFRESH_EXPIRES_IN;
  },
  get PORT(): number {
    return (parsedEnv || validateEnv()).PORT;
  },
  get NODE_ENV(): string {
    return (parsedEnv || validateEnv()).NODE_ENV;
  },
  get CORS_ORIGINS(): string[] {
    return (parsedEnv || validateEnv()).CORS_ORIGINS.split(',').map((origin) => origin.trim());
  },
  get LOGIN_RATE_LIMIT_MAX(): number {
    return (parsedEnv || validateEnv()).LOGIN_RATE_LIMIT_MAX;
  },
  get LOGIN_RATE_LIMIT_WINDOW_MS(): number {
    return (parsedEnv || validateEnv()).LOGIN_RATE_LIMIT_WINDOW_MS;
  },
  get DB_SSL(): string {
    return (parsedEnv || validateEnv()).DB_SSL;
  },
  get DB_SSL_REJECT_UNAUTHORIZED(): string {
    return (parsedEnv || validateEnv()).DB_SSL_REJECT_UNAUTHORIZED;
  },
  get DB_SSL_CA_PATH(): string {
    return (parsedEnv || validateEnv()).DB_SSL_CA_PATH;
  },
};
