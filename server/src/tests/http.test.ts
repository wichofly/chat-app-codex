import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { readConfig } from '../config.js';
import { createAuth } from '../lib/auth.js';
import { createPrisma } from '../lib/prisma.js';

const config = readConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://unreachable:unused@127.0.0.1:1/thread',
  BETTER_AUTH_SECRET: 'test-only-secret-must-be-at-least-32-characters',
});
const database = createPrisma(config.DATABASE_URL);
const auth = createAuth(database, config);
const app = createApp({ config, auth, database });
afterAll(() => database.$disconnect());
afterEach(() => vi.restoreAllMocks());

describe('HTTP authentication boundary without a database', () => {
  it('serves a non-sensitive health response with no-store', async () => {
    const result = await request(app).get('/api/health').expect(200);
    expect(result.body).toEqual({ data: { status: 'ok' } });
    expect(result.headers['cache-control']).toBe('no-store');
  });
  it('reports readiness only when the database responds', async () => {
    vi.spyOn(database, '$queryRaw').mockResolvedValueOnce([{ value: 1 }]);
    const result = await request(app).get('/api/ready').expect(200);
    expect(result.body).toEqual({ data: { status: 'ready' } });
    expect(result.headers['cache-control']).toBe('no-store');
  });
  it('returns a recoverable readiness error without exposing database details', async () => {
    vi.spyOn(database, '$queryRaw').mockRejectedValueOnce(new Error('Private database detail'));
    const result = await request(app).get('/api/ready').expect(503);
    expect(result.body).toEqual({
      error: { code: 'NOT_READY', message: 'The service is temporarily unavailable.' },
    });
    expect(result.headers['cache-control']).toBe('no-store');
    await request(app).get('/api/health').expect(200);
  });
  it('uses the nearest forwarded client for rate limits when one proxy hop is trusted', async () => {
    const proxied = createApp({
      config: { ...config, TRUST_PROXY_HOPS: 1 }, auth, database,
    });
    const attempt = (forwarded: string) => request(proxied)
      .post('/api/auth/sign-in/email')
      .set('Origin', config.CLIENT_ORIGIN)
      .set('X-Forwarded-For', forwarded)
      .send({});
    const first = await attempt('192.0.2.1, 198.51.100.10');
    const sameClient = await attempt('192.0.2.2, 198.51.100.10');
    const otherClient = await attempt('198.51.100.11');
    expect(first.headers.ratelimit).toMatch(/\br=29\b/);
    expect(sameClient.headers.ratelimit).toMatch(/\br=28\b/);
    expect(otherClient.headers.ratelimit).toMatch(/\br=29\b/);
  });
  it.each(['get', 'post', 'patch', 'delete'] as const)(
    'rejects unauthenticated %s requests before accessing storage',
    async (method) => {
      const path =
        method === 'get' || method === 'post'
          ? '/api/chats'
          : '/api/chats/00000000-0000-4000-8000-000000000000';
      const result = await request(app)
        [method](path)
        .send({ title: 'Unowned' })
        .expect(401);
      expect(result.body.error.code).toBe('UNAUTHORIZED');
    },
  );
  it('allows credentialed CORS only for configured origins', async () => {
    const allowed = await request(app)
      .options('/api/auth/sign-in/email')
      .set('Origin', config.CLIENT_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);
    expect(allowed.headers['access-control-allow-origin']).toBe(
      config.CLIENT_ORIGIN,
    );
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    const denied = await request(app)
      .post('/api/auth/sign-in/email')
      .set('Origin', 'https://untrusted.example')
      .send({})
      .expect(403);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
