import { describe, expect, it } from 'vitest';
import { readConfig } from '../config.js';

const input = {
  DATABASE_URL: 'postgresql://test:example@localhost:5432/thread',
  BETTER_AUTH_SECRET: 'test-only-secret-must-be-at-least-32-characters',
};

describe('authentication configuration', () => {
  it('accepts the server-only OpenRouter API key and validates AI guardrails', () => {
    expect(
      readConfig({ ...input, OPENROUTER_API_KEY: 'test-only-key' })
        .OPENROUTER_API_KEY,
    ).toBe('test-only-key');
    expect(
      readConfig({
        ...input,
        OPENROUTER_API_KEY: 'replace-with-your-openrouter-key',
      }).OPENROUTER_API_KEY,
    ).toBeUndefined();
    expect(() => readConfig({ ...input, MAX_AI_OUTPUT_TOKENS: '0' })).toThrow(
      'MAX_AI_OUTPUT_TOKENS',
    );
  });
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
      TRUST_PROXY_HOPS: 0,
      AI_MAX_CONTEXT_TOKENS: 32768,
      AI_CONTEXT_SAFETY_MARGIN_TOKENS: 1024,
    });
    expect(() =>
      readConfig({
        ...input,
        AI_MAX_CONTEXT_TOKENS: '2048',
        MAX_AI_OUTPUT_TOKENS: '1536',
        AI_CONTEXT_SAFETY_MARGIN_TOKENS: '1024',
      }),
    ).toThrow('AI_MAX_CONTEXT_TOKENS');
    expect(() =>
      readConfig({ ...input, CLIENT_ORIGIN: 'http://localhost:5173/path' }),
    ).toThrow('CLIENT_ORIGIN');
    expect(() =>
      readConfig({ ...input, CLIENT_ORIGIN: 'ftp://localhost' }),
    ).toThrow('CLIENT_ORIGIN');
  });
  it('accepts only a bounded proxy hop count', () => {
    expect(readConfig({ ...input, TRUST_PROXY_HOPS: '1' }).TRUST_PROXY_HOPS).toBe(1);
    for (const value of ['true', '-1', '1.5', '6'])
      expect(() => readConfig({ ...input, TRUST_PROXY_HOPS: value })).toThrow('TRUST_PROXY_HOPS');
  });
  it('requires a strong shared proxy secret when one is configured', () => {
    expect(readConfig(input).TRUSTED_PROXY_SECRET).toBeUndefined();
    expect(() => readConfig({ ...input, TRUSTED_PROXY_SECRET: 'short' })).toThrow('TRUSTED_PROXY_SECRET');
    expect(readConfig({ ...input, TRUSTED_PROXY_SECRET: 'test-only-proxy-secret-with-32-characters' }).TRUSTED_PROXY_SECRET).toBe('test-only-proxy-secret-with-32-characters');
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
