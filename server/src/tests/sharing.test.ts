import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { readConfig } from '../config.js';
import { createAuth } from '../lib/auth.js';
import { createPrisma } from '../lib/prisma.js';
import { paragraph } from '../modules/ai/content.js';
import { sharingService } from '../modules/sharing/service.js';

const config = readConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/test',
  BETTER_AUTH_SECRET: 'test-only-secret-at-least-32-characters',
});
const database = createPrisma(config.DATABASE_URL);
const auth = createAuth(database, config);
const service = sharingService(database, config);
afterEach(() => vi.restoreAllMocks());
afterAll(() => database.$disconnect());

describe('durable sharing boundaries', () => {
  it('captures only public fields, generates a fresh bearer token, and keeps the snapshot separate', async () => {
    const id = randomUUID();
    vi.spyOn(database, '$transaction').mockImplementation(async (callback) => {
      if (typeof callback !== 'function')
        throw new Error('Expected transaction callback');
      return callback(database);
    });
    vi.spyOn(database, '$queryRaw').mockResolvedValue([{ id }]);
    const chat = {
      id,
      userId: 'private-owner',
      title: 'Shared title',
      createdAt: new Date(),
      updatedAt: new Date(),
      contextSummary: 'PRIVATE SUMMARY',
      contextThroughSequence: 2,
      messages: [
        {
          role: 'USER' as const,
          contentJson: paragraph('Question'),
          plainText: 'Question',
        },
      ],
    };
    vi.spyOn(database.chat, 'findUniqueOrThrow').mockResolvedValue(chat);
    const savedShare = {
      id: randomUUID(),
      chatId: id,
      token: 'a'.repeat(43),
      snapshotJson: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      revokedAt: null,
    };
    const upsert = vi
      .spyOn(database.shareLink, 'upsert')
      .mockResolvedValueOnce(savedShare)
      .mockResolvedValueOnce({ ...savedShare, token: 'b'.repeat(43) });
    const first = await service.create(id, 'private-owner');
    const second = await service.create(id, 'private-owner');
    expect(first.url).toMatch(/\/shared\/[A-Za-z0-9_-]{43}$/);
    expect(second.url).not.toBe(first.url);
    expect(upsert.mock.calls[0]?.[0].create.token).toMatch(
      /^[A-Za-z0-9_-]{43}$/,
    );
    expect(upsert.mock.calls[1]?.[0].create.token).not.toBe(
      upsert.mock.calls[0]?.[0].create.token,
    );
    const saved = upsert.mock.calls[0]?.[0].create.snapshotJson;
    expect(saved).toEqual({
      title: 'Shared title',
      messages: [{ role: 'USER', contentJson: paragraph('Question') }],
      sharedAt: expect.any(String),
    });
    expect(JSON.stringify(saved)).not.toContain('PRIVATE');
    expect(database.chat.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          title: true,
          messages: {
            where: { status: 'COMPLETED' },
            orderBy: { sequence: 'asc' },
            select: { role: true, contentJson: true, plainText: true },
          },
        },
      }),
    );
    vi.mocked(database.$queryRaw).mockResolvedValueOnce([]);
    await expect(service.create(id, 'intruder')).rejects.toMatchObject({
      status: 404,
    });
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it('serves a snapshot without a session and returns the same safe 404 for invalid and revoked tokens', async () => {
    const app = createApp({ config, database, auth });
    const snapshot = {
      title: 'Public',
      messages: [{ role: 'USER', contentJson: paragraph('Visible') }],
      sharedAt: new Date().toISOString(),
    };
    const lookup = vi.spyOn(database.shareLink, 'findFirst').mockResolvedValue({
      id: randomUUID(),
      chatId: randomUUID(),
      token: 'a'.repeat(43),
      snapshotJson: snapshot,
      createdAt: new Date(),
      updatedAt: new Date(),
      revokedAt: null,
    });
    const publicResponse = await request(app)
      .get(`/api/shared/${'a'.repeat(43)}`)
      .expect(200);
    expect(publicResponse.body).toEqual({ data: snapshot });
    expect(publicResponse.headers['cache-control']).toBe('no-store');
    expect(publicResponse.headers['x-robots-tag']).toBe('noindex, nofollow');
    const invalid = await request(app).get('/api/shared/invalid').expect(404);
    lookup.mockResolvedValueOnce(null);
    expect(
      (
        await request(app)
          .get(`/api/shared/${'b'.repeat(43)}`)
          .expect(404)
      ).body,
    ).toEqual(invalid.body);
    expect(lookup).toHaveBeenLastCalledWith({
      where: { token: 'b'.repeat(43), revokedAt: null },
      select: { snapshotJson: true },
    });
  });

  it('rate limits public token guessing and protects private share operations', async () => {
    const app = createApp({ config, database, auth });
    for (let index = 0; index < 60; index++)
      await request(app).get('/api/shared/invalid').expect(404);
    const limited = await request(app).get('/api/shared/invalid').expect(429);
    expect(limited.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(limited.headers['cache-control']).toBe('no-store');
    for (const method of ['get', 'post', 'delete'] as const)
      await request(app)
        [method](`/api/chats/${randomUUID()}/share`)
        .set('Origin', config.CLIENT_ORIGIN)
        .send({})
        .expect(401);
  });
});
