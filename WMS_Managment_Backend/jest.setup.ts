import dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });

jest.setTimeout(30000);

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-testing-purposes-only';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
process.env.JWT_EXPIRES_IN = '24h';
process.env.PORT = '0';
process.env.NODE_ENV = 'test';
