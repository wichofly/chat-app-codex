import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { readConfig } from '../config.js';
import { createPrisma } from '../lib/prisma.js';
import { errorHandler } from '../middleware/errors.js';
import { paragraph } from '../modules/ai/content.js';
import type { ModelRunner } from '../modules/ai/provider.js';
import { streamHandler } from '../modules/ai/stream.js';

const store = vi.hoisted(() => ({
  begin: vi.fn(async () => ({
    user: { id: 'user-message' },
    assistant: {
      id: 'assistant-message',
      generationId: 'generation',
      sequence: 2,
    },
    replay: false,
  })),
  history: vi.fn(async () => [
    { role: 'user' as const, content: 'A question' },
  ]),
  finish: vi.fn(async () => true),
}));
vi.mock('../modules/ai/repository.js', () => ({
  messageRepository: () => store,
}));

const config = readConfig({
  DATABASE_URL: 'postgresql://unreachable:unused@127.0.0.1:1/thread',
  BETTER_AUTH_SECRET: 'test-only-secret-must-be-at-least-32-characters',
});
const database = createPrisma(config.DATABASE_URL);
const run = vi.fn<ModelRunner>(async function* () {
  yield 'An answer';
});
const stream = streamHandler(database, config, run);
const app = express();
app.use(express.json());
// Exercise the streaming boundary with mocked storage; auth/ownership have separate HTTP coverage.
app.post('/stream', (req, res) => stream.send(req, res, 'chat', 'owner'));
app.use(errorHandler);
const body = {
  clientMessageId: '00000000-0000-4000-8000-000000000001',
  contentJson: paragraph('A question'),
};
afterEach(() => vi.clearAllMocks());
afterAll(() => database.$disconnect());

describe('streaming persona request validation without a database', () => {
  it.each(['assistant', 'eli5', 'coach'])(
    'passes the validated %s persona to generation',
    async (persona) => {
      const result = await request(app)
        .post('/stream')
        .send({ ...body, persona })
        .expect(200);
      expect(result.text).toContain('An answer');
      expect(run).toHaveBeenCalledWith(expect.objectContaining({ persona }));
      expect(store.finish).toHaveBeenCalledWith(
        'assistant-message',
        'generation',
        expect.objectContaining({ status: 'COMPLETED' }),
      );
    },
  );
  it('defaults older requests to Thread', async () => {
    await request(app).post('/stream').send(body).expect(200);
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ persona: 'assistant' }),
    );
  });
  it.each(['unknown', '', null, {}, ['coach']])(
    'rejects invalid persona %j before creating a message',
    async (persona) => {
      await request(app)
        .post('/stream')
        .send({ ...body, persona })
        .expect(400);
      expect(store.begin).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
    },
  );
  it.each(['system', 'systemPrompt', 'instructions', 'modelId', 'messages'])(
    'rejects client-supplied %s rather than accepting arbitrary AI configuration',
    async (field) => {
      await request(app)
        .post('/stream')
        .send({ ...body, persona: 'coach', [field]: 'Override' })
        .expect(400);
      expect(store.begin).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
    },
  );
});
