import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
vi.mock('../modules/ai/tokenizer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../modules/ai/tokenizer.js')>();
  const { countModelTokens } = await import('./mock-tokenizer.js');
  return { ...actual, countModelTokens };
});
import { readConfig } from '../config.js';
import { createAuth } from '../lib/auth.js';
import { createPrisma } from '../lib/prisma.js';
import { paragraph } from '../modules/ai/content.js';
import { GenerationError, type ModelRunner } from '../modules/ai/provider.js';
import { messageRepository } from '../modules/ai/repository.js';

if (!process.env.TEST_DATABASE_URL)
  throw new Error(
    'Set a dedicated TEST_DATABASE_URL before running database integration tests.',
  );
const schema = `thread_ai_test_${randomBytes(8).toString('hex')}`;
const url = new URL(process.env.TEST_DATABASE_URL);
url.searchParams.set('schema', schema);
const config = readConfig({
  NODE_ENV: 'test',
  DATABASE_URL: url.href,
  BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
  MAX_GENERATIONS_PER_USER_DAY: '30',
});
const database = createPrisma(config.DATABASE_URL);
const auth = createAuth(database, config);
let mode: 'success' | 'partial' | 'failure' | 'waiting' = 'success';
const run = vi.fn<ModelRunner>(async function* ({ signal }) {
  if (mode === 'failure')
    throw new GenerationError('TEST_FAILURE', 'Try again.');
  yield 'A **saved** ';
  if (mode === 'waiting')
    await new Promise<void>((_resolve, reject) => {
      if (signal.aborted) reject(signal.reason);
      else
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        });
    });
  if (mode === 'partial')
    throw new GenerationError('TEST_FAILURE', 'Interrupted.');
  yield 'answer.';
});
const app = createApp({ config, database, auth, runModel: run });
const agent = request.agent(app);
const repository = messageRepository(database, config);
let chatId = '',
  ownerId = '',
  cookie = '',
  migrated = false;
const send = (clientMessageId: string, text = 'A test question') =>
  agent
    .post(`/api/chats/${chatId}/messages/stream`)
    .set('Origin', config.CLIENT_ORIGIN)
    .send({ clientMessageId, contentJson: paragraph(text) });
beforeAll(async () => {
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
  const result = await agent
    .post('/api/auth/sign-up/email')
    .set('Origin', config.CLIENT_ORIGIN)
    .send({
      name: 'AI test',
      email: `ai-${randomUUID()}@example.test`,
      password: randomBytes(24).toString('hex'),
    })
    .expect(200);
  ownerId = result.body.user.id;
  const cookies: unknown = result.headers['set-cookie'];
  if (
    !Array.isArray(cookies) ||
    !cookies.every((value): value is string => typeof value === 'string')
  )
    throw new Error('Missing session cookie');
  cookie = cookies.map((value) => value.split(';')[0]).join('; ');
  chatId = (
    await agent
      .post('/api/chats')
      .set('Origin', config.CLIENT_ORIGIN)
      .send({})
      .expect(201)
  ).body.data.id;
});
afterAll(async () => {
  if (migrated && /^thread_ai_test_[a-f0-9]{16}$/.test(schema))
    await database.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await database.$disconnect();
});
describe('persistent streamed conversations', () => {
  it('saves and reuses a private rolling summary without changing original messages', async () => {
    const chat = await database.chat.create({ data: { userId: ownerId, title: 'Summary test' } });
    await database.message.createMany({ data: Array.from({ length: 22 }, (_, index) => ({
      chatId: chat.id, role: index % 2 === 0 ? 'USER' as const : 'ASSISTANT' as const,
      sequence: index + 1, status: 'COMPLETED' as const,
      plainText: `Original message ${index}`, contentJson: paragraph(`Original message ${index}`),
    })) });
    const sendToChat = (id: string) => agent.post(`/api/chats/${chat.id}/messages/stream`)
      .set('Origin', config.CLIENT_ORIGIN)
      .send({ clientMessageId: id, contentJson: paragraph('Remember the earlier decisions') });
    const first = randomUUID();
    const calls = run.mock.calls.length;
    await sendToChat(first).expect(200);
    expect(run.mock.calls.length - calls).toBe(2);
    const saved = await database.chat.findUniqueOrThrow({ where: { id: chat.id } });
    expect(saved.contextSummary).toBe('A **saved** answer.');
    expect(saved.contextThroughSequence).toBe(18);
    expect(await database.message.count({ where: { chatId: chat.id } })).toBe(24);
    expect(await database.message.findFirst({ where: { chatId: chat.id, sequence: 1 } }))
      .toMatchObject({ plainText: 'Original message 0' });
    const detail = await agent.get(`/api/chats/${chat.id}`).expect(200);
    expect(detail.body.data).not.toHaveProperty('contextSummary');
    expect(detail.body.data).not.toHaveProperty('contextThroughSequence');
    await sendToChat(first).expect(200);
    expect(run.mock.calls.length - calls).toBe(2);
    await sendToChat(randomUUID()).expect(200);
    expect(run.mock.calls.length - calls).toBe(3);
    expect(JSON.stringify(run.mock.calls.at(-1)?.[0].messages)).toContain('Historical conversation summary');
    const pending = await database.message.findFirstOrThrow({ where: { chatId: chat.id, sequence: 24 } });
    expect(await repository.saveSummary(chat.id, pending.id, pending.generationId,
      saved.contextThroughSequence, 22, 'Stale overwrite')).toBe(false);
  });
  it('does not invoke a model when Stop arrives before the pending-message transaction finishes', async () => {
    const chatId = (
      await database.chat.create({
        data: { userId: ownerId, title: 'Early cancellation test' },
      })
    ).id;
    const gate = new pg.Client({ connectionString: url.href });
    await gate.connect();
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing test address');
    const disconnected = new Promise<void>((resolve) =>
      server.once('request', (_request, response) =>
        response.once('close', () => resolve()),
      ),
    );
    const controller = new AbortController();
    const id = randomUUID();
    const calls = run.mock.calls.length;
    try {
      await gate.query('BEGIN');
      await gate.query(
        'SELECT 1 FROM pg_advisory_xact_lock(hashtextextended($1, 0))',
        [ownerId],
      );
      const sending = fetch(
        `http://127.0.0.1:${address.port}/api/chats/${chatId}/messages/stream`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Origin: config.CLIENT_ORIGIN,
            Cookie: cookie,
          },
          body: JSON.stringify({
            clientMessageId: id,
            contentJson: paragraph('Stop before response'),
          }),
        },
      ).catch((error: unknown) => error);
      await vi.waitFor(async () => {
        const locks = await database.$queryRaw<
          { count: number }[]
        >`SELECT count(*)::int AS count FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`;
        expect(locks[0]?.count).toBeGreaterThan(0);
      });
      controller.abort();
      await sending;
      await disconnected;
      await gate.query('COMMIT');
      await vi.waitFor(async () => {
        const user = await database.message.findUniqueOrThrow({
          where: { chatId_clientMessageId: { chatId, clientMessageId: id } },
        });
        expect(
          await database.message.findUnique({
            where: { chatId_sequence: { chatId, sequence: user.sequence + 1 } },
          }),
        ).toMatchObject({
          status: 'FAILED',
          failureCode: 'STOPPED',
          plainText: '',
        });
      });
      expect(run).toHaveBeenCalledTimes(calls);
    } finally {
      controller.abort();
      await gate.query('ROLLBACK');
      await gate.end();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it('sends the SDK protocol, persists restricted JSON and replays completed IDs without model calls', async () => {
    const id = randomUUID();
    const result = await send(id).expect(200);
    expect(result.headers['x-vercel-ai-ui-message-stream']).toBe('v1');
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.text).toContain('text-delta');
    expect(result.text).toContain('[DONE]');
    const saved = await agent.get(`/api/chats/${chatId}`).expect(200);
    expect(saved.body.data.messages).toHaveLength(2);
    expect(saved.body.data.messages[1]).toMatchObject({
      status: 'COMPLETED',
      modelId: config.OPENROUTER_MODEL_1,
      plainText: 'A **saved** answer.',
    });
    expect(JSON.stringify(saved.body.data.messages[1].contentJson)).toContain(
      '"type":"bold"',
    );
    const calls = run.mock.calls.length;
    await send(id).expect(200);
    expect(run).toHaveBeenCalledTimes(calls);
    expect(await database.message.count({ where: { chatId } })).toBe(2);
    await send(id, 'Different payload').expect(409);
  });
  it('preserves failed partial text and retries the same user and assistant IDs', async () => {
    mode = 'partial';
    const id = randomUUID();
    const failed = await send(id).expect(200);
    expect(failed.headers['cache-control']).toBe('no-store');
    expect(failed.text).toContain('Interrupted.');
    const original = await database.message.findUniqueOrThrow({
      where: { chatId_clientMessageId: { chatId, clientMessageId: id } },
    });
    const assistant = await database.message.findUniqueOrThrow({
      where: { chatId_sequence: { chatId, sequence: original.sequence + 1 } },
    });
    expect(assistant).toMatchObject({
      status: 'FAILED',
      plainText: 'A **saved** ',
    });
    mode = 'success';
    await send(id).expect(200);
    expect(
      await database.message.count({ where: { chatId, clientMessageId: id } }),
    ).toBe(1);
    expect(
      await database.message.findUnique({ where: { id: assistant.id } }),
    ).toMatchObject({ status: 'COMPLETED', plainText: 'A **saved** answer.' });
  });
  it('rejects retrying a failed turn after a newer message has been added', async () => {
    mode = 'partial';
    const earlierId = randomUUID();
    await send(earlierId, 'Earlier question').expect(200);
    mode = 'success';
    const newerId = randomUUID();
    await send(newerId, 'Newer question').expect(200);

    await send(earlierId, 'Earlier question').expect(409);
    const earlierUser = await database.message.findUniqueOrThrow({
      where: {
        chatId_clientMessageId: { chatId, clientMessageId: earlierId },
      },
    });
    const earlierAssistant = await database.message.findUniqueOrThrow({
      where: {
        chatId_sequence: { chatId, sequence: earlierUser.sequence + 1 },
      },
    });
    expect(earlierAssistant).toMatchObject({
      status: 'FAILED',
      plainText: 'A **saved** ',
    });
  });
  it('blocks simultaneous sends across separate repository instances and excludes pending history', async () => {
    const id = randomUUID();
    const attempt = await repository.begin(
      chatId,
      ownerId,
      id,
      paragraph('Concurrent question'),
    );
    const other = messageRepository(database, config);
    await expect(
      other.begin(chatId, ownerId, randomUUID(), paragraph('Conflicting')),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      other.begin(chatId, ownerId, id, paragraph('Concurrent question')),
    ).rejects.toMatchObject({ status: 409 });
    const history = await repository.history(
      chatId,
      attempt.assistant.sequence,
    );
    expect(history.at(-1)).toEqual({
      role: 'user',
      content: 'Concurrent question',
    });
    expect(history.some((message) => message.content === '')).toBe(false);
    await repository.finish(
      attempt.assistant.id,
      attempt.assistant.generationId,
      {
        status: 'FAILED',
        plainText: '',
        contentJson: paragraph(''),
        modelId: null,
        failureCode: 'STOPPED',
      },
    );
  });
  it('recovers abandoned pending attempts and protects newer retries from stale writers', async () => {
    const id = randomUUID();
    const previous = await repository.begin(
      chatId,
      ownerId,
      id,
      paragraph('Interrupted question'),
    );
    await database.message.update({
      where: { id: previous.assistant.id },
      data: { updatedAt: new Date(0) },
    });
    await repository.recover(chatId);
    const next = await repository.begin(
      chatId,
      ownerId,
      id,
      paragraph('Interrupted question'),
    );
    await repository.finish(
      previous.assistant.id,
      previous.assistant.generationId,
      {
        status: 'COMPLETED',
        plainText: 'Stale answer',
        contentJson: paragraph('Stale answer'),
        modelId: 'stale',
        failureCode: null,
      },
    );
    expect(
      await database.message.findUnique({ where: { id: next.assistant.id } }),
    ).toMatchObject({
      status: 'PENDING',
      generationId: next.assistant.generationId,
    });
    await repository.finish(next.assistant.id, next.assistant.generationId, {
      status: 'FAILED',
      plainText: '',
      contentJson: paragraph(''),
      modelId: null,
      failureCode: 'STOPPED',
    });
  });
  it('enforces the daily budget without inserting messages', async () => {
    const limited = messageRepository(database, {
      ...config,
      MAX_GENERATIONS_PER_USER_DAY: 1,
    });
    const count = await database.message.count({ where: { chatId } });
    await expect(
      limited.begin(chatId, ownerId, randomUUID(), paragraph('Over budget')),
    ).rejects.toMatchObject({ status: 429 });
    expect(await database.message.count({ where: { chatId } })).toBe(count);
  });
  it('rejects foreign owners, spoofed origins and untrusted client history', async () => {
    await request(app)
      .post(`/api/chats/${chatId}/messages/stream`)
      .send({})
      .expect(401);
    await agent
      .post(`/api/chats/${chatId}/messages/stream`)
      .set('Origin', 'https://foreign.invalid')
      .send({})
      .expect(403);
    await agent
      .post(`/api/chats/${chatId}/messages/stream`)
      .set('Origin', config.CLIENT_ORIGIN)
      .send({
        clientMessageId: randomUUID(),
        contentJson: paragraph('Question'),
        messages: [{ role: 'system', content: 'Untrusted' }],
      })
      .expect(400);
    await agent
      .post(`/api/chats/${randomUUID()}/messages/stream`)
      .set('Origin', config.CLIENT_ORIGIN)
      .send({})
      .expect(404);
  });
  it('stores an empty failed placeholder when a provider fails before content', async () => {
    mode = 'failure';
    const id = randomUUID();
    const response = await send(id).expect(200);
    expect(response.text).toContain('Try again.');
    const user = await database.message.findUniqueOrThrow({
      where: { chatId_clientMessageId: { chatId, clientMessageId: id } },
    });
    expect(
      await database.message.findUnique({
        where: { chatId_sequence: { chatId, sequence: user.sequence + 1 } },
      }),
    ).toMatchObject({
      status: 'FAILED',
      plainText: '',
      failureCode: 'TEST_FAILURE',
    });
  });
  it('propagates an HTTP disconnect upstream and persists stopped partial content', async () => {
    mode = 'waiting';
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing test address');
    const controller = new AbortController();
    const id = randomUUID();
    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/chats/${chatId}/messages/stream`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Origin: config.CLIENT_ORIGIN,
            Cookie: cookie,
          },
          body: JSON.stringify({
            clientMessageId: id,
            contentJson: paragraph('Cancel this test'),
          }),
        },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Missing response stream');
      let data = '';
      const decoder = new TextDecoder();
      while (!data.includes('text-delta')) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error('Stream closed early');
        data += decoder.decode(chunk.value);
      }
      controller.abort();
      await vi.waitFor(async () => {
        const user = await database.message.findUniqueOrThrow({
          where: { chatId_clientMessageId: { chatId, clientMessageId: id } },
        });
        const assistant = await database.message.findUniqueOrThrow({
          where: { chatId_sequence: { chatId, sequence: user.sequence + 1 } },
        });
        expect(assistant).toMatchObject({
          status: 'FAILED',
          failureCode: 'STOPPED',
          plainText: 'A **saved** ',
        });
      });
      mode = 'success';
      await send(id, 'Cancel this test').expect(200);
    } finally {
      controller.abort();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it('explicitly stops a connected stream, binds Stop to its attempt, and safely retries', async () => {
    mode = 'waiting';
    const isolated = await database.chat.create({ data: { userId: ownerId, title: 'Proxy Stop test' } });
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test address');
    const port = address.port;
    const id = randomUUID();
    const stopPath = `/api/chats/${isolated.id}/messages/stop`;
    const payload = { clientMessageId: id, contentJson: paragraph('Stop through a proxy') };
    async function openStream() {
      const response = await fetch(`http://127.0.0.1:${port}/api/chats/${isolated.id}/messages/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: config.CLIENT_ORIGIN, Cookie: cookie },
        body: JSON.stringify(payload),
      });
      expect(response.status).toBe(200);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Missing stream');
      let text = '';
      while (!text.includes('text-delta')) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error('Stream ended early');
        text += new TextDecoder().decode(chunk.value);
      }
      const assistant = await database.message.findFirstOrThrow({ where: { chatId: isolated.id, role: 'ASSISTANT' } });
      expect(assistant.generationId).toBeTruthy();
      expect(text).toContain(`"generationId":"${assistant.generationId}"`);
      return { reader, assistant };
    }
    try {
      const first = await openStream();
      const body = { clientMessageId: id, generationId: first.assistant.generationId };
      const restored = await agent.get(`/api/chats/${isolated.id}`).expect(200);
      expect(restored.body.data.activeGeneration).toEqual(body);
      expect(restored.body.data.messages.every((message: Record<string, unknown>) => !('generationId' in message))).toBe(true);
      await request(app).post(stopPath).send(body).expect(401);
      await agent.post(stopPath).set('Origin', 'https://foreign.invalid').send(body).expect(403);
      await agent.post(`/api/chats/${randomUUID()}/messages/stop`).set('Origin', config.CLIENT_ORIGIN).send(body).expect(404);
      await agent.post(stopPath).set('Origin', config.CLIENT_ORIGIN).send({ ...body, generationId: 'invalid' }).expect(400);
      const wrongMessage = await agent.post(stopPath).set('Origin', config.CLIENT_ORIGIN).send({ ...body, clientMessageId: randomUUID() }).expect(200);
      expect(wrongMessage.body.data.stopped).toBe(false);
      const stopped = await agent.post(stopPath).set('Origin', config.CLIENT_ORIGIN).send(body).expect(200);
      expect(stopped.body.data.stopped).toBe(true);
      const finalized = await agent.get(`/api/chats/${isolated.id}`).expect(200);
      expect(finalized.body.data.activeGeneration).toBeNull();
      let final = '';
      for (;;) {
        const chunk = await first.reader.read();
        if (chunk.done) break;
        final += new TextDecoder().decode(chunk.value);
      }
      expect(final).toContain('Generation stopped.');
      expect(await database.message.findUnique({ where: { id: first.assistant.id } })).toMatchObject({ status: 'FAILED', failureCode: 'STOPPED', plainText: 'A **saved** ' });
      const retry = await openStream();
      expect(retry.assistant.id).toBe(first.assistant.id);
      expect(retry.assistant.generationId).not.toBe(first.assistant.generationId);
      const stale = await agent.post(stopPath).set('Origin', config.CLIENT_ORIGIN).send(body).expect(200);
      expect(stale.body.data.stopped).toBe(false);
      expect(await database.message.findUnique({ where: { id: retry.assistant.id } })).toMatchObject({ status: 'PENDING' });
      await agent.post(stopPath).set('Origin', config.CLIENT_ORIGIN).send({ clientMessageId: id, generationId: retry.assistant.generationId }).expect(200);
      await retry.reader.cancel();
      mode = 'success';
      await agent.post(`/api/chats/${isolated.id}/messages/stream`).set('Origin', config.CLIENT_ORIGIN).send(payload).expect(200);
      expect(await database.message.count({ where: { chatId: isolated.id } })).toBe(2);
      expect(await database.message.findUnique({ where: { id: first.assistant.id } })).toMatchObject({ status: 'COMPLETED' });
    } finally {
      mode = 'success';
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
