import type { Config } from 'jest';

const config: Config = {
  maxWorkers: 1,
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  testTimeout: 60000,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
};

export default config;
