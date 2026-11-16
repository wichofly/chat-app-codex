import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../app/App';
import { useChatList } from '../features/chats/use-chat-list';
import { api } from '../lib/api';
import type { ChatListPage } from '../lib/types';

const date = '2026-11-16T12:00:00Z';
const chat = (id: string) => ({
  id,
  title: `Conversation ${id}`,
  createdAt: date,
  updatedAt: date,
});

describe('saved chat pagination', () => {
  it('loads older sidebar conversations, preserves existing links on failure and retries the same cursor', async () => {
    let olderRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL) => {
        if (String(url).includes('/auth/get-session'))
          return Response.json({
            user: { id: 'owner', name: 'Alex', email: 'owner@example.test' },
          });
        if (String(url).includes('/chats?cursor=')) {
          olderRequests++;
          return olderRequests === 1
            ? Response.json(
                { error: { message: 'Temporary failure' } },
                { status: 503 },
              )
            : Response.json({
                data: [chat('recent'), chat('older')],
                nextCursor: null,
              });
        }
        return Response.json({
          data: [chat('recent')],
          nextCursor: 'older-cursor',
        });
      }),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/chats']}>
        <App />
      </MemoryRouter>,
    );
    await user.click(
      await screen.findByRole('button', { name: 'Load more conversations' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t load more chats.',
    );
    expect(
      screen.getByRole('link', { name: 'Conversation recent' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('link', { name: 'Conversation older' }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: 'Conversation recent' }),
    ).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: 'Load more conversations' }),
    ).not.toBeInTheDocument();
  });

  it('discards a stale older page after a list refresh', async () => {
    let resolvePage: (page: ChatListPage) => void = () => {};
    const pending = new Promise<ChatListPage>((resolve) => {
      resolvePage = resolve;
    });
    const load = vi
      .spyOn(api, 'listChatPage')
      .mockResolvedValueOnce({
        chats: [chat('original')],
        nextCursor: 'cursor',
      })
      .mockReturnValueOnce(pending)
      .mockResolvedValueOnce({ chats: [chat('refreshed')], nextCursor: null });
    const { result, rerender } = renderHook(
      ({ revision }) => useChatList(api, revision, true),
      { initialProps: { revision: 0 } },
    );
    await waitFor(() => expect(result.current.chats).toHaveLength(1));
    act(() => {
      void result.current.loadMore();
      void result.current.loadMore();
    });
    expect(load).toHaveBeenCalledTimes(2);
    rerender({ revision: 1 });
    await waitFor(() => expect(result.current.chats[0]?.id).toBe('refreshed'));
    await act(async () => {
      resolvePage({ chats: [chat('stale')], nextCursor: null });
      await pending;
    });
    expect(result.current.chats.map((item) => item.id)).toEqual(['refreshed']);
  });
});
