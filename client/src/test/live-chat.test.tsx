import { act, renderHook, waitFor } from '@testing-library/react';
import type { UIMessageChunk } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { useLiveChat } from '../features/chats/use-live-chat';
import { paragraph, type Chat } from '../lib/types';

const chat: Chat = {
  id: 'chat',
  title: 'Saved chat',
  createdAt: '',
  updatedAt: '',
  messages: [],
};
function mockStream() {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const encoder = new TextEncoder();
  const emit = (chunk: UIMessageChunk) =>
    controller?.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/messages/stop'))
        return Response.json({ data: { stopped: true } });
      const stream = new ReadableStream<Uint8Array>({
        start(value) {
          controller = value;
        },
      });
      init?.signal?.addEventListener(
        'abort',
        () => controller?.error(new DOMException('Aborted', 'AbortError')),
        { once: true },
      );
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'x-vercel-ai-ui-message-stream': 'v1',
        },
      });
    },
  );
  const finish = () => {
    controller?.enqueue(encoder.encode('data: [DONE]\n\n'));
    controller?.close();
  };
  vi.stubGlobal('fetch', fetcher);
  return { fetcher, emit, finish };
}
describe('real chat transport', () => {
  it('stops a restored pending generation without an active SDK stream and retries its prompt', async () => {
    const stream = mockStream();
    const refresh = vi.fn();
    const clientMessageId = crypto.randomUUID();
    const saved: Chat = {
      ...chat,
      activeGeneration: { clientMessageId, generationId: 'restored-generation' },
      messages: [
        { id: 'user', role: 'USER', status: 'COMPLETED', contentJson: paragraph('Restored prompt'), plainText: 'Restored prompt', clientMessageId },
        { id: 'assistant', role: 'ASSISTANT', status: 'PENDING', contentJson: null, plainText: '', clientMessageId: null },
      ],
    };
    const { result, rerender } = renderHook(({ initial }) => useLiveChat(chat.id, initial, true, refresh), { initialProps: { initial: saved } });
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.busy).toBe(true);
    act(() => { expect(result.current.send(paragraph('Concurrent send'))).toBe(false); result.current.stop(); });
    await waitFor(() => expect(stream.fetcher).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(stream.fetcher.mock.calls[0]?.[1]?.body))).toEqual(saved.activeGeneration);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const failed: Chat = { ...saved, activeGeneration: null, messages: [saved.messages[0], { ...saved.messages[1], status: 'FAILED', failureCode: 'STOPPED', contentJson: paragraph('Partial'), plainText: 'Partial' }] };
    rerender({ initial: failed });
    await waitFor(() => expect(result.current.busy).toBe(false));
    act(() => result.current.retry('assistant'));
    await waitFor(() => expect(stream.fetcher).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(stream.fetcher.mock.calls[1]?.[1]?.body))).toEqual({ clientMessageId, contentJson: paragraph('Restored prompt') });
    expect(result.current.messages.filter(message => message.role === 'USER')).toHaveLength(1);
  });
  it('continues polling a restored pending generation while sends stay blocked', async () => {
    mockStream();
    const refresh = vi.fn();
    const pending: Chat = { ...chat, messages: [{ id: 'pending', role: 'ASSISTANT', status: 'PENDING', plainText: '', contentJson: null }] };
    const { result } = renderHook(() => useLiveChat(chat.id, pending, true, refresh));
    expect(result.current.busy).toBe(true);
    await waitFor(() => expect(refresh).toHaveBeenCalled(), { timeout: 1500 });
  });
  it('retries a rejected request without duplicating the optimistic prompt', async () => {
    const stream = mockStream();
    stream.fetcher.mockResolvedValueOnce(
      Response.json(
        { error: { message: 'The AI service is unavailable.' } },
        { status: 503 },
      ),
    );
    const refresh = vi.fn();
    const { result } = renderHook(() =>
      useLiveChat(chat.id, chat, true, refresh),
    );
    const clientMessageId = crypto.randomUUID();
    act(() => {
      result.current.send(paragraph('Keep this prompt'), clientMessageId);
    });
    await waitFor(() =>
      expect(result.current.error).toBe('The AI service is unavailable.'),
    );
    expect(result.current.messages.at(-1)?.status).toBe('FAILED');
    const failedId = result.current.messages.at(-1)?.id;
    act(() => result.current.retry(failedId));
    await waitFor(() => expect(stream.fetcher).toHaveBeenCalledTimes(2));
    expect(
      result.current.messages.filter((message) => message.role === 'USER'),
    ).toHaveLength(1);
    expect(JSON.parse(String(stream.fetcher.mock.calls[1]?.[1]?.body))).toEqual(
      {
        clientMessageId,
        contentJson: paragraph('Keep this prompt'),
      },
    );
  });
  it('adds optimistic messages, renders progressive text, and sends only the canonical request', async () => {
    const stream = mockStream();
    const refresh = vi.fn();
    const { result } = renderHook(() =>
      useLiveChat(chat.id, chat, true, refresh),
    );
    const contentJson = paragraph('A question');
    const clientMessageId = crypto.randomUUID();
    act(() => {
      expect(result.current.send(contentJson, clientMessageId)).toBe(true);
      expect(result.current.send(contentJson)).toBe(false);
    });
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.messages[0].plainText).toBe('A question');
    expect(result.current.messages[1].status).toBe('PENDING');
    await waitFor(() => expect(stream.fetcher).toHaveBeenCalledTimes(1));
    const init = stream.fetcher.mock.calls[0]?.[1];
    expect(JSON.parse(String(init?.body))).toEqual({
      clientMessageId,
      contentJson,
    });
    expect(init?.credentials).toBe('include');
    await act(async () => {
      stream.emit({
        type: 'start',
        messageId: 'assistant',
        messageMetadata: { clientMessageId, generationId: 'generation', status: 'PENDING' },
      });
      stream.emit({ type: 'text-start', id: 'answer' });
      stream.emit({ type: 'text-delta', id: 'answer', delta: 'Progressive ' });
    });
    await waitFor(() =>
      expect(result.current.messages[1].plainText).toBe('Progressive '),
    );
    await act(async () => {
      stream.emit({ type: 'text-delta', id: 'answer', delta: 'answer' });
      stream.emit({ type: 'text-end', id: 'answer' });
      stream.emit({
        type: 'finish',
        messageMetadata: {
          clientMessageId,
          status: 'COMPLETED',
          modelId: 'selected-model',
        },
      });
      stream.finish();
    });
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.messages[1]).toMatchObject({
      status: 'COMPLETED',
      plainText: 'Progressive answer',
      modelId: 'selected-model',
    });
    expect(refresh).toHaveBeenCalled();
  });
  it('aborts Stop, preserves partial text and retries without another user message', async () => {
    const stream = mockStream();
    const refresh = vi.fn();
    const { result } = renderHook(() =>
      useLiveChat(chat.id, chat, true, refresh),
    );
    const clientMessageId = crypto.randomUUID();
    const contentJson = paragraph('Keep the prompt');
    act(() => {
      result.current.send(contentJson, clientMessageId);
    });
    await waitFor(() => expect(stream.fetcher).toHaveBeenCalledTimes(1));
    await act(async () => {
      stream.emit({
        type: 'start',
        messageId: 'assistant',
        messageMetadata: { clientMessageId, generationId: 'generation', status: 'PENDING' },
      });
      stream.emit({ type: 'text-start', id: 'answer' });
      stream.emit({ type: 'text-delta', id: 'answer', delta: 'Partial text' });
    });
    await waitFor(() =>
      expect(result.current.messages[1].plainText).toBe('Partial text'),
    );
    await act(async () => {
      result.current.stop();
    });
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.messages[1]).toMatchObject({
      status: 'FAILED',
      plainText: 'Partial text',
      failureCode: 'STOPPED',
    });
    expect(stream.fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(String(stream.fetcher.mock.calls[1]?.[0])).toBe('/api/chats/chat/messages/stop');
    expect(JSON.parse(String(stream.fetcher.mock.calls[1]?.[1]?.body))).toEqual({ clientMessageId, generationId: 'generation' });
    act(() => result.current.retry('assistant'));
    await waitFor(() => expect(stream.fetcher).toHaveBeenCalledTimes(3));
    expect(JSON.parse(String(stream.fetcher.mock.calls[2]?.[1]?.body))).toEqual(
      { clientMessageId, contentJson },
    );
    expect(
      result.current.messages.filter((message) => message.role === 'USER'),
    ).toHaveLength(1);
    await act(async () => {
      stream.emit({
        type: 'start',
        messageId: 'assistant',
        messageMetadata: { clientMessageId, status: 'PENDING' },
      });
      stream.emit({ type: 'text-start', id: 'retry' });
      stream.emit({ type: 'text-delta', id: 'retry', delta: 'Retried' });
      stream.emit({ type: 'text-end', id: 'retry' });
      stream.emit({
        type: 'finish',
        messageMetadata: { status: 'COMPLETED', clientMessageId },
      });
      stream.finish();
    });
    await waitFor(() => expect(result.current.busy).toBe(false));
  });
  it('queues an early Stop until the server identifies the active attempt', async () => {
    const stream = mockStream();
    const refresh = vi.fn();
    const { result } = renderHook(() => useLiveChat(chat.id, chat, true, refresh));
    const clientMessageId = crypto.randomUUID();
    act(() => { result.current.send(paragraph('Keep this early prompt'), clientMessageId); });
    await waitFor(() => expect(stream.fetcher).toHaveBeenCalledTimes(1));
    act(() => result.current.stop());
    expect(stream.fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
    expect(result.current.busy).toBe(true);
    act(() => { expect(result.current.send(paragraph('Blocked'))).toBe(false); });
    await act(async () => {
      stream.emit({ type: 'start', messageId: 'assistant', messageMetadata: { clientMessageId, generationId: 'generation', status: 'PENDING' } });
      stream.emit({ type: 'text-start', id: 'answer' });
    });
    await waitFor(() => expect(stream.fetcher).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(stream.fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true));
    expect(result.current.messages.filter(message => message.role === 'USER')).toHaveLength(1);
  });
  it('keeps reading when the explicit Stop request fails and exposes a recoverable error', async () => {
    const stream = mockStream();
    const refresh = vi.fn();
    const { result } = renderHook(() => useLiveChat(chat.id, chat, true, refresh));
    const clientMessageId = crypto.randomUUID();
    act(() => { result.current.send(paragraph('A question'), clientMessageId); });
    await waitFor(() => expect(stream.fetcher).toHaveBeenCalledTimes(1));
    await act(async () => {
      stream.emit({ type: 'start', messageId: 'assistant', messageMetadata: { clientMessageId, generationId: 'generation', status: 'PENDING' } });
      stream.emit({ type: 'text-start', id: 'answer' });
    });
    stream.fetcher.mockResolvedValueOnce(Response.json({ error: { message: 'Unable to stop. Try again.' } }, { status: 503 }));
    act(() => result.current.stop());
    await waitFor(() => expect(result.current.error).toBe('Unable to stop. Try again.'));
    expect(stream.fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
    expect(result.current.busy).toBe(true);
    await act(async () => {
      stream.emit({ type: 'text-delta', id: 'answer', delta: 'Completed normally' });
      stream.emit({ type: 'text-end', id: 'answer' });
      stream.emit({ type: 'finish', messageMetadata: { clientMessageId, status: 'COMPLETED' } });
      stream.finish();
    });
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.messages.at(-1)).toMatchObject({ status: 'COMPLETED', plainText: 'Completed normally' });
  });
  it('hydrates saved rich text and cancels generation on unmount', async () => {
    const stream = mockStream();
    const refresh = vi.fn();
    const document = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Saved', marks: [{ type: 'bold' }] }],
        },
      ],
    };
    const initial: Chat = {
      ...chat,
      messages: [
        {
          id: 'saved',
          role: 'USER',
          status: 'COMPLETED',
          plainText: 'Saved',
          contentJson: document,
        },
      ],
    };
    const { result, unmount } = renderHook(() =>
      useLiveChat(chat.id, initial, true, refresh),
    );
    await waitFor(() =>
      expect(result.current.messages[0]?.contentJson).toEqual(document),
    );
    act(() => {
      result.current.send(paragraph('Another'));
    });
    await waitFor(() => expect(stream.fetcher).toHaveBeenCalledTimes(1));
    unmount();
    expect(stream.fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});
