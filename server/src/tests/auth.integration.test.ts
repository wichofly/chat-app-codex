import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { readConfig } from '../config.js';
import { createAuth } from '../lib/auth.js';
import { createPrisma } from '../lib/prisma.js';
import { paragraph } from '../modules/ai/content.js';

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
  it('reports readiness from a real database without requiring a session', async () => {
    const result = await request(app).get('/api/ready').expect(200);
    expect(result.body).toEqual({ data: { status: 'ready' } });
    expect(result.headers['cache-control']).toBe('no-store');
  });
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
  it('paginates more than 100 owned chats, including tied timestamps and a deleted cursor row', async () => {
    const ids = Array.from({ length: 103 }, () => randomUUID());
    const date = new Date('2026-01-01T00:00:00Z');
    await database.chat.createMany({
      data: ids.map((id) => ({
        id,
        userId: ownerId,
        title: 'Pagination fixture',
        updatedAt: date,
      })),
    });
    const seen = new Set<string>();
    let cursor: string | null = null;
    do {
      const result: request.Response = await agent
        .get('/api/chats')
        .query({ limit: 25, ...(cursor ? { cursor } : {}) })
        .expect(200);
      for (const chat of result.body.data) {
        expect(seen.has(chat.id)).toBe(false);
        seen.add(chat.id);
      }
      cursor = result.body.nextCursor;
      if (seen.size === 25) {
        // A cursor describes the sort position; deleting its row must not break later pages.
        await database.chat.delete({
          where: { id: result.body.data.at(-1).id },
        });
      }
    } while (cursor);
    expect(seen.size).toBe(104); // 103 fixtures plus the original owned chat.
    await agent.get('/api/chats').query({ cursor: 'invalid' }).expect(400);
    await agent.get('/api/chats').query({ limit: 101 }).expect(400);
    await database.chat.deleteMany({ where: { id: { in: ids } } });
  });
  it('persists private-safe snapshots, rotates/revokes tokens and cascades deletion', async () => {
    const created = await agent
      .post('/api/chats')
      .set('Origin', config.CLIENT_ORIGIN)
      .send({ title: 'Snapshot title' })
      .expect(201);
    const id: string = created.body.data.id;
    await database.chat.update({
      where: { id },
      data: { contextSummary: 'PRIVATE SUMMARY', contextThroughSequence: 2 },
    });
    await database.message.createMany({
      data: [
        {
          chatId: id,
          sequence: 1,
          role: 'USER',
          status: 'COMPLETED',
          plainText: 'Public question',
          contentJson: paragraph('Public question'),
          clientMessageId: randomUUID(),
        },
        {
          chatId: id,
          sequence: 2,
          role: 'ASSISTANT',
          status: 'COMPLETED',
          plainText: 'Public answer',
          contentJson: paragraph('Public answer'),
          modelId: 'PRIVATE MODEL',
          generationId: randomUUID(),
        },
        {
          chatId: id,
          sequence: 3,
          role: 'ASSISTANT',
          status: 'FAILED',
          plainText: 'PRIVATE FAILED',
        },
        {
          chatId: id,
          sequence: 4,
          role: 'ASSISTANT',
          status: 'PENDING',
          plainText: 'PRIVATE PENDING',
        },
      ],
    });
    const sharePath = `/api/chats/${id}/share`;
    expect((await agent.get(sharePath).expect(200)).body.data).toEqual({
      url: null,
    });
    await request(app)
      .post(sharePath)
      .set('Origin', config.CLIENT_ORIGIN)
      .send({})
      .expect(401);
    await agent.post(sharePath).send({}).expect(403);
    const outsider = request.agent(app);
    await outsider
      .post('/api/auth/sign-up/email')
      .set('Origin', config.CLIENT_ORIGIN)
      .send({ name: 'Other reader', email: `share-${email}`, password })
      .expect(200);
    for (const method of ['get', 'post', 'delete'] as const)
      await outsider[method](sharePath)
        .set('Origin', config.CLIENT_ORIGIN)
        .send({})
        .expect(404);
    const create = () =>
      agent
        .post(sharePath)
        .set('Origin', config.CLIENT_ORIGIN)
        .send({})
        .expect(200);
    const first = await create();
    const publicPath = new URL(first.body.data.url).pathname.replace(
      '/shared/',
      '/api/shared/',
    );
    const snapshot = await request(app).get(publicPath).expect(200);
    expect(snapshot.headers['cache-control']).toBe('no-store');
    expect(snapshot.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(snapshot.body.data).toEqual({
      title: 'Snapshot title',
      messages: [
        { role: 'USER', contentJson: paragraph('Public question') },
        { role: 'ASSISTANT', contentJson: paragraph('Public answer') },
      ],
      sharedAt: first.body.data.sharedAt,
    });
    expect(JSON.stringify(snapshot.body)).not.toContain('PRIVATE');
    expect(
      (await request(app).get(sharePath).set('Cookie', cookie).expect(200)).body
        .data,
    ).toEqual(first.body.data);
    await database.chat.update({
      where: { id },
      data: { title: 'Later title' },
    });
    await database.message.create({
      data: {
        chatId: id,
        sequence: 5,
        role: 'USER',
        status: 'COMPLETED',
        plainText: 'Later private message',
        contentJson: paragraph('Later private message'),
      },
    });
    expect((await request(app).get(publicPath).expect(200)).body).toEqual(
      snapshot.body,
    );
    const rotations = await Promise.all([create(), create()]);
    await request(app).get(publicPath).expect(404);
    const active = (await agent.get(sharePath).expect(200)).body.data.url;
    expect(
      rotations.filter((result) => result.body.data.url === active),
    ).toHaveLength(1);
    for (const result of rotations) {
      if (result.body.data.url !== active)
        await request(app).get(new URL(result.body.data.url).pathname.replace('/shared/', '/api/shared/')).expect(404);
    }
    const activePath = new URL(active).pathname.replace(
      '/shared/',
      '/api/shared/',
    );
    expect(
      (await request(app).get(activePath).expect(200)).body.data.title,
    ).toBe('Later title');
    await agent
      .delete(sharePath)
      .set('Origin', config.CLIENT_ORIGIN)
      .expect(204);
    await request(app).get(activePath).expect(404);
    expect((await agent.get(sharePath).expect(200)).body.data.url).toBeNull();
    const last = await create();
    await agent
      .delete(`/api/chats/${id}`)
      .set('Origin', config.CLIENT_ORIGIN)
      .expect(204);
    await request(app)
      .get(
        new URL(last.body.data.url).pathname.replace(
          '/shared/',
          '/api/shared/',
        ),
      )
      .expect(404);
    expect(await database.shareLink.count({ where: { chatId: id } })).toBe(0);
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
