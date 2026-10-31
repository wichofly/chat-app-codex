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
  it('ignores unsigned forwarded identities even when Express proxy hops are configured', async () => {
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
    expect(otherClient.headers.ratelimit).toMatch(/\br=27\b/);
  });
  it('separates verified visitors behind Vercel while ignoring forged visitor headers', async () => {
    const proxySecret = 'test-only-proxy-secret-with-32-characters';
    const proxyConfig = { ...config, TRUST_PROXY_HOPS: 1, TRUSTED_PROXY_SECRET: proxySecret };
    const proxied = createApp({ config: proxyConfig, auth: createAuth(database, proxyConfig), database });
    const attempt = (visitor: string, secret?: string) => {
      const sending = request(proxied)
        .post('/api/auth/sign-in/email')
        .set('Origin', config.CLIENT_ORIGIN)
        .set('X-Forwarded-For', `${visitor}, 198.51.100.2`)
        .set('X-Real-IP', visitor)
        .set('X-Thread-Client-IP', visitor);
      if (secret) sending.set('X-Thread-Proxy-Secret', secret);
      return sending.send({});
    };
    const first = await attempt('192.0.2.10', proxySecret);
    const other = await attempt('192.0.2.11', proxySecret);
    const same = await attempt('192.0.2.10', proxySecret);
    expect(first.headers.ratelimit).toMatch(/\br=29\b/);
    expect(other.headers.ratelimit).toMatch(/\br=29\b/);
    expect(same.headers.ratelimit).toMatch(/\br=28\b/);
    const forged = await attempt('192.0.2.20', 'wrong-secret');
    const forgedAgain = await attempt('192.0.2.21');
    expect(forged.status).toBe(403);
    expect(forgedAgain.status).toBe(403);
    expect(forged.body.error.code).toBe('UNTRUSTED_PROXY');
    await request(proxied).get('/api/health').set('X-Real-IP', '192.0.2.99').expect(200);
    vi.spyOn(database, '$queryRaw').mockResolvedValueOnce([{ value: 1 }]);
    await request(proxied).get('/api/ready').expect(200);
    // Better Auth must receive the same normalized identity as Express, not a shared fallback.
    let lastStatus = 0;
    for (let index = 0; index < 11; index++) lastStatus = (await attempt('192.0.2.30', proxySecret)).status;
    expect(lastStatus).toBe(429);
    expect((await attempt('192.0.2.31', proxySecret)).status).not.toBe(429);
    const ipv6 = await attempt('2001:db8:1::1', proxySecret);
    const sameSubnet = await attempt('2001:db8:1::2', proxySecret);
    const differentSubnet = await attempt('2001:db8:200::1', proxySecret);
    expect(ipv6.headers.ratelimit).toMatch(/\br=29\b/);
    expect(sameSubnet.headers.ratelimit).toMatch(/\br=28\b/);
    expect(differentSubnet.headers.ratelimit).toMatch(/\br=29\b/);
    await attempt('invalid-address', proxySecret).expect(400);
    await request(proxied).get('/api/health').set('X-Thread-Proxy-Secret', proxySecret).expect(400);
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
