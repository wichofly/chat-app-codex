import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { readConfig } from '../config.js';
import { createAuth } from '../lib/auth.js';
import { createPrisma } from '../lib/prisma.js';

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl)
  throw new Error(
    'Set TEST_DATABASE_URL to a PostgreSQL test database before running test:integration. A unique schema will be created and removed.',
  );
const schema = `thread_auth_test_${randomBytes(8).toString('hex')}`;
const url = new URL(testUrl);
url.searchParams.set('schema', schema);
const config = readConfig({
  NODE_ENV: 'test',
  DATABASE_URL: url.href,
  BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
});
const database = createPrisma(config.DATABASE_URL);
const auth = createAuth(database, config);
const app = createApp({ config, auth, database });
const agent = request.agent(app);
const email = `thread-${randomUUID()}@example.test`;
const password = 'test-only-Password-2026!';
const signup = () =>
  agent
    .post('/api/auth/sign-up/email')
    .set('Origin', config.CLIENT_ORIGIN)
    .send({ name: 'Alex', email, password });
let cookie = '';
let ownerId = '';
let createdId = '';
let migrated = false;

beforeAll(() => {
  const require = createRequire(import.meta.url);
  execFileSync(
    process.execPath,
    [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
    {
      env: { ...process.env, DATABASE_URL: config.DATABASE_URL },
      stdio: 'pipe',
    },
  );
  migrated = true;
});
afterAll(async () => {
  if (migrated) {
    // Only this freshly generated, validated schema is ever removed.
    if (!/^thread_auth_test_[a-f0-9]{16}$/.test(schema))
      throw new Error('Unsafe test schema');
    await database.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  }
  await database.$disconnect();
});

describe('Better Auth + PostgreSQL + protected chat routes', () => {
  it('signs up through Express, stores a password hash, and sets a private cookie', async () => {
    const result = await signup().expect(200);
    ownerId = result.body.user.id;
    expect(result.body.user).toMatchObject({
      name: 'Alex',
      email,
      emailVerified: false,
    });
    expect(result.body.user.password).toBeUndefined();
    const cookies: unknown = result.headers['set-cookie'];
    if (
      !Array.isArray(cookies) ||
      !cookies.every((value): value is string => typeof value === 'string')
    )
      throw new Error('Missing auth cookie');
    const sessionCookie = cookies.find((value) =>
      value.includes('session_token='),
    );
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
    cookie = cookies.map((value) => value.split(';')[0]).join('; ');
    const account = await database.account.findFirstOrThrow({
      where: { userId: ownerId, providerId: 'credential' },
    });
    expect(account.password).toBeTruthy();
    expect(account.password).not.toBe(password);
    expect(await database.session.count({ where: { userId: ownerId } })).toBe(
      1,
    );
  });
  it('restores a database-backed session in a fresh client', async () => {
    const result = await request(app)
      .get('/api/auth/get-session')
      .set('Cookie', cookie)
      .expect(200);
    expect(result.body.user.id).toBe(ownerId);
  });
  it('rejects wrong credentials, duplicate emails, short passwords, and invalid email addresses', async () => {
    await request(app)
      .post('/api/auth/sign-in/email')
      .set('Origin', config.CLIENT_ORIGIN)
      .send({ email, password: 'wrong-password' })
      .expect(401);
    expect((await signup()).status).toBeGreaterThanOrEqual(400);
    for (const values of [
      { name: 'Alex', email: 'invalid-email', password },
      { name: 'Alex', email: `short-${email}`, password: 'short' },
    ]) {
      const result = await request(app)
        .post('/api/auth/sign-up/email')
        .set('Origin', config.CLIENT_ORIGIN)
        .send(values);
      expect(result.status).toBeGreaterThanOrEqual(400);
      expect(result.status).toBeLessThan(500);
    }
  });
  it('protects and persists owned chat creation, list, retrieval and rename', async () => {
    const created = await agent
      .post('/api/chats')
      .set('Origin', config.CLIENT_ORIGIN)
      .send({})
      .expect(201);
    createdId = created.body.data.id;
    expect(created.body.data.title).toBe('New chat');
    await agent
      .patch(`/api/chats/${createdId}`)
      .set('Origin', config.CLIENT_ORIGIN)
      .send({ title: 'Saved conversation' })
      .expect(200);
    const fresh = request(app);
    expect(
      (
        await fresh
          .get(`/api/chats/${createdId}`)
          .set('Cookie', cookie)
          .expect(200)
      ).body.data,
    ).toMatchObject({ title: 'Saved conversation', messages: [] });
    expect((await agent.get('/api/chats').expect(200)).body.data).toHaveLength(
      1,
    );
    await agent
      .post('/api/chats')
      .set('Origin', config.CLIENT_ORIGIN)
      .send({ userId: 'forged-owner' })
      .expect(400);
  });
  it('rejects untrusted or missing mutation origins and cross-user chat access', async () => {
    await agent
      .patch(`/api/chats/${createdId}`)
      .send({ title: 'CSRF' })
      .expect(403);
    await agent
      .patch(`/api/chats/${createdId}`)
      .set('Origin', 'https://evil.example')
      .send({ title: 'CSRF' })
      .expect(403);
    const other = request.agent(app);
    await other
      .post('/api/auth/sign-up/email')
      .set('Origin', config.CLIENT_ORIGIN)
      .send({ name: 'Other', email: `other-${email}`, password })
      .expect(200);
    expect((await other.get('/api/chats').expect(200)).body.data).toEqual([]);
    await other.get(`/api/chats/${createdId}`).expect(404);
    await other
      .patch(`/api/chats/${createdId}`)
      .set('Origin', config.CLIENT_ORIGIN)
      .send({ title: 'Stolen' })
      .expect(404);
    await other
      .delete(`/api/chats/${createdId}`)
      .set('Origin', config.CLIENT_ORIGIN)
      .expect(404);
    await other.get(`/api/chats/${createdId}/share`).expect(404);
    await request(app)
      .post('/api/auth/sign-out')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example')
      .send({})
      .expect(403);
  });
  it('signs out, revokes the session cookie server-side, and accepts a new sign-in', async () => {
    await agent
      .post('/api/auth/sign-out')
      .set('Origin', config.CLIENT_ORIGIN)
      .send({})
      .expect(200);
    await request(app).get('/api/chats').set('Cookie', cookie).expect(401);
    expect(
      (
        await request(app)
          .get('/api/auth/get-session')
          .set('Cookie', cookie)
          .expect(200)
      ).body,
    ).toBeNull();
    const signedIn = await agent
      .post('/api/auth/sign-in/email')
      .set('Origin', config.CLIENT_ORIGIN)
      .send({ email, password })
      .expect(200);
    expect(signedIn.body.user.id).toBe(ownerId);
    await agent
      .delete(`/api/chats/${createdId}`)
      .set('Origin', config.CLIENT_ORIGIN)
      .expect(204);
    await agent.get(`/api/chats/${createdId}`).expect(404);
  });
  it('rejects expired sessions from storage', async () => {
    await database.session.updateMany({
      where: { userId: ownerId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (await agent.get('/api/auth/get-session').expect(200)).body,
    ).toBeNull();
    await agent.get('/api/chats').expect(401);
  });
  it('uses secure cookies for HTTPS production configuration', async () => {
    const production = {
      ...config,
      NODE_ENV: 'production' as const,
      CLIENT_ORIGIN: 'https://app.example.test',
      BETTER_AUTH_URL: 'https://api.example.test',
    };
    const productionApp = createApp({
      config: production,
      auth: createAuth(database, production),
      database,
    });
    const response = await request(productionApp)
      .post('/api/auth/sign-in/email')
      .set('Origin', production.CLIENT_ORIGIN)
      .send({ email, password })
      .expect(200);
    const cookies: unknown = response.headers['set-cookie'];
    if (
      !Array.isArray(cookies) ||
      !cookies.every((value): value is string => typeof value === 'string')
    )
      throw new Error('Missing secure cookie');
    const token = cookies.find((value) => value.includes('session_token='));
    expect(token).toMatch(/Secure/);
    expect(token).toMatch(/HttpOnly/i);
  });
  it('rate-limits auth mutations and keeps private responses uncached', async () => {
    let limited = false;
    for (let i = 0; i < 35; i++) {
      const result = await request(app)
        .post('/api/auth/sign-in/email')
        .set('Origin', config.CLIENT_ORIGIN)
        .send({ email, password: 'invalid-password' });
      if (result.status === 429) {
        limited = true;
        expect(result.headers['cache-control']).toBe('no-store');
        break;
      }
    }
    expect(limited).toBe(true);
  });
});
