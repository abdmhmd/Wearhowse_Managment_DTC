// NOTE: dotenv.config() must be called at the app entry point (server.ts / jest.setup.ts)
// before any module imports that use env.ts.

const requiredVars = ['DATABASE_URL', 'JWT_SECRET'] as const;

export function validateEnv(): void {
  const missing: string[] = [];
  for (const v of requiredVars) {
    if (!process.env[v]) missing.push(v);
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}.`
    );
  }
}

export const env = {
  get DATABASE_URL(): string { return process.env.DATABASE_URL!; },
  get JWT_SECRET(): string { return process.env.JWT_SECRET!; },
  get JWT_EXPIRES_IN(): string { return process.env.JWT_EXPIRES_IN || '24h'; },
  get PORT(): number { return parseInt(process.env.PORT || '3000', 10); },
  get CORS_ORIGINS(): string[] {
    return process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['*'];
  },
  get NODE_ENV(): string { return process.env.NODE_ENV || 'development'; },
};
