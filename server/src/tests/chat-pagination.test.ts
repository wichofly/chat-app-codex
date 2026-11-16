import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { chatCursor, chatListQuery } from '../modules/chats/pagination.js';

describe('conversation cursor validation', () => {
  it('retains both sort keys and bounds page size', () => {
    const chat = { id: randomUUID(), updatedAt: new Date() };
    expect(
      chatListQuery.parse({ cursor: chatCursor(chat), limit: '25' }),
    ).toEqual({
      cursor: { id: chat.id, updatedAt: chat.updatedAt.toISOString() },
      limit: 25,
    });
    expect(chatListQuery.parse({})).toEqual({ limit: 100 });
  });
  it('rejects malformed cursors, invalid timestamps and oversized pages', () => {
    for (const value of [
      { cursor: 'not-json' },
      { cursor: 'x'.repeat(513) },
      {
        cursor: Buffer.from(
          JSON.stringify({ id: randomUUID(), updatedAt: 'invalid-date' }),
        ).toString('base64url'),
      },
      { limit: 0 },
      { limit: 101 },
      { limit: '1.5' },
      { cursor: ['one', 'two'] },
    ])
      expect(chatListQuery.safeParse(value).success).toBe(false);
  });
});
