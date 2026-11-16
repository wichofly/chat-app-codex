import { useEffect, useRef, useState } from 'react';
import type { ChatListPage, ChatService } from '../../lib/types';

type ListState = ChatListPage & {
  service: ChatService;
  revision: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
};

export function useChatList(
  service: ChatService,
  revision: number,
  enabled: boolean,
) {
  const [state, setState] = useState<ListState | null>(null);
  const epoch = useRef(0);
  const pending = useRef(false);
  useEffect(() => {
    const current = ++epoch.current;
    pending.current = false;
    if (!enabled) return;
    setState({
      service,
      revision,
      chats: [],
      nextCursor: null,
      loading: true,
      loadingMore: false,
      error: null,
    });
    void service
      .listChatPage()
      .then((page) => {
        if (epoch.current === current)
          setState({
            ...page,
            service,
            revision,
            loading: false,
            loadingMore: false,
            error: null,
          });
      })
      .catch(() => {
        if (epoch.current === current)
          setState({
            service,
            revision,
            chats: [],
            nextCursor: null,
            loading: false,
            loadingMore: false,
            error: 'Couldn’t load your chats.',
          });
      });
    return () => {
      epoch.current++;
    };
  }, [service, revision, enabled]);

  const current =
    state?.service === service && state.revision === revision ? state : null;
  async function loadMore() {
    if (
      !current?.nextCursor ||
      current.loadingMore ||
      pending.current ||
      !enabled
    )
      return;
    const started = epoch.current;
    pending.current = true;
    setState({ ...current, loadingMore: true, error: null });
    try {
      const page = await service.listChatPage(current.nextCursor);
      if (epoch.current !== started) return;
      const seen = new Set(current.chats.map((chat) => chat.id));
      setState({
        ...current,
        chats: [
          ...current.chats,
          ...page.chats.filter((chat) => !seen.has(chat.id)),
        ],
        nextCursor: page.nextCursor,
        loadingMore: false,
        error: null,
      });
    } catch {
      if (epoch.current === started)
        setState({
          ...current,
          loadingMore: false,
          error: 'Couldn’t load more chats. Please try again.',
        });
    } finally {
      if (epoch.current === started) pending.current = false;
    }
  }
  return {
    chats: current?.chats ?? [],
    loading: !current || current.loading,
    loadingMore: current?.loadingMore ?? false,
    nextCursor: current?.nextCursor,
    error: current?.error,
    loadMore,
  };
}
