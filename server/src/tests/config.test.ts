import { describe, expect, it } from 'vitest';
import { readConfig } from '../config.js';

const input = {
  DATABASE_URL: 'postgresql://test:example@localhost:5432/thread',
  BETTER_AUTH_SECRET: 'test-only-secret-must-be-at-least-32-characters',
};

describe('authentication configuration', () => {
  it('requires PostgreSQL and a non-placeholder secret without leaking values', () => {
    expect(() =>
      readConfig({ ...input, DATABASE_URL: 'sqlite://secret-value' }),
    ).toThrow('DATABASE_URL');
    expect(() =>
      readConfig({ ...input, BETTER_AUTH_SECRET: 'short-secret-value' }),
    ).toThrow('BETTER_AUTH_SECRET');
    try {
      readConfig({ ...input, DATABASE_URL: 'invalid-secret-value' });
    } catch (error) {
      expect(String(error)).not.toContain('invalid-secret-value');
    }
  });
  it('uses consistent local defaults and rejects malformed origins', () => {
    expect(readConfig(input)).toMatchObject({
      PORT: 3001,
      CLIENT_ORIGIN: 'http://localhost:5173',
      BETTER_AUTH_URL: 'http://localhost:3001',
    });
    expect(() =>
      readConfig({ ...input, CLIENT_ORIGIN: 'http://localhost:5173/path' }),
    ).toThrow('CLIENT_ORIGIN');
    expect(() =>
      readConfig({ ...input, CLIENT_ORIGIN: 'ftp://localhost' }),
    ).toThrow('CLIENT_ORIGIN');
  });
  it('requires HTTPS for production cookies', () => {
    expect(() => readConfig({ ...input, NODE_ENV: 'production' })).toThrow(
      'HTTPS',
    );
    expect(
      readConfig({
        ...input,
        NODE_ENV: 'production',
        BETTER_AUTH_URL: 'https://api.example.test',
        CLIENT_ORIGIN: 'https://app.example.test',
      }).NODE_ENV,
    ).toBe('production');
  });
});
