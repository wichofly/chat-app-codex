import { useSyncExternalStore } from 'react';
import { useApp } from '../../app/providers';

const noSubscribe = () => () => {};
const noSnapshot = () => undefined;

export function usePreviewChat(id: string | undefined) {
  const { previewService } = useApp();
  return useSyncExternalStore(previewService?.subscribe ?? noSubscribe, () =>
    id ? previewService?.getChatSnapshot(id) : undefined,
  );
}

export function usePreviewChatList() {
  const { previewService } = useApp();
  return useSyncExternalStore(
    previewService?.subscribe ?? noSubscribe,
    previewService?.getListSnapshot ?? noSnapshot,
  );
}
