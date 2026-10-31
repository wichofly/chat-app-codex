import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useEffect, useMemo, useRef, useState } from 'react';
import { baseUrl, request } from '../../lib/api';
import {
  paragraph,
  type Chat,
  type Message,
  type RichDocument,
} from '../../lib/types';

type Metadata = {
  clientMessageId?: string;
  generationId?: string | null;
  modelId?: string | null;
  status?: Message['status'];
  failureCode?: string | null;
};
type LiveMessage = UIMessage<Metadata>;
function textOf(document: RichDocument): string {
  return (
    document.text ??
    document.content?.map(textOf).join(document.type === 'doc' ? '\n' : '') ??
    ''
  );
}
function toUI(message: Message): LiveMessage {
  return {
    id: message.id,
    role: message.role === 'USER' ? 'user' : 'assistant',
    parts: [{ type: 'text', text: message.plainText }],
    metadata: {
      status: message.status,
      clientMessageId: message.clientMessageId ?? undefined,
      modelId: message.modelId,
      failureCode: message.failureCode,
    },
  };
}

export function useLiveChat(
  chatId: string | undefined,
  initial: Chat | null | undefined,
  enabled: boolean,
  refresh: () => void,
) {
  const documents = useRef(new Map<string, RichDocument>());
  const hydrated = useRef<Chat | null>(null);
  const sending = useRef(false);
  const lastSend = useRef<string | null>(null);
  const [stopped, setStopped] = useState<string | null>(null);
  const [stopRequested, setStopRequested] = useState(false);
  const [stopError, setStopError] = useState<string>();
  const transport = useMemo(
    () =>
      new DefaultChatTransport<LiveMessage>({
        api: `${baseUrl}/chats/${encodeURIComponent(chatId ?? '')}/messages/stream`,
        credentials: 'include',
        // The server loads history. Never send the SDK's client-side messages as context.
        prepareSendMessagesRequest: ({ body }) => ({ body: body ?? {} }),
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          if (!response.ok) {
            if (response.status === 401)
              window.dispatchEvent(new Event('thread:session-expired'));
            const value: unknown = await response.json().catch(() => null);
            const detail =
              value && typeof value === 'object' && 'error' in value
                ? value.error
                : null;
            throw new Error(
              detail &&
                typeof detail === 'object' &&
                'message' in detail &&
                typeof detail.message === 'string'
                ? detail.message
                : 'The AI service is unavailable. Please retry.',
            );
          }
          return response;
        },
      }),
    [chatId],
  );
  const sdk = useChat<LiveMessage>({
    id: chatId ?? 'new-chat',
    transport,
    onFinish: refresh,
  });
  const streaming = sdk.status === 'submitted' || sdk.status === 'streaming';
  const busy = streaming || stopRequested;
  const latest = sdk.messages.at(-1);
  const generationId =
    latest?.role === 'assistant' ? latest.metadata?.generationId : undefined;
  useEffect(() => {
    if (!stopRequested || !chatId || !generationId || !lastSend.current) return;
    let disposed = false;
    const clientMessageId = lastSend.current;
    void request<{ stopped: boolean }>(
      `/chats/${encodeURIComponent(chatId)}/messages/stop`,
      {
        method: 'POST',
        body: JSON.stringify({ clientMessageId, generationId }),
      },
    )
      .then(async (result) => {
        if (disposed) return;
        if (!result.stopped) setStopped(null); // Completion may win the race with Stop.
        await sdk.stop();
        refresh();
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setStopped(null);
          setStopError(
            error instanceof Error
              ? error.message
              : 'Unable to stop the response. Try again.',
          );
        }
      })
      .finally(() => {
        if (!disposed) setStopRequested(false);
      });
    return () => {
      disposed = true;
    };
  }, [stopRequested, chatId, generationId, sdk.stop, refresh]);
  useEffect(() => {
    if (!streaming && stopRequested) setStopRequested(false);
  }, [streaming, stopRequested]);
  useEffect(() => {
    documents.current.clear();
    hydrated.current = null;
    lastSend.current = null;
    sending.current = false;
    setStopRequested(false);
    setStopError(undefined);
    return () => {
      void sdk.stop();
    };
  }, [chatId]);
  useEffect(() => {
    if (!enabled || !initial || initial === hydrated.current || busy) return;
    hydrated.current = initial;
    for (const message of initial.messages)
      if (message.contentJson)
        documents.current.set(message.id, message.contentJson);
    sdk.setMessages(initial.messages.map(toUI));
  }, [initial, enabled, busy, sdk.setMessages]);
  useEffect(() => {
    if (
      !enabled ||
      busy ||
      !initial?.messages.some((message) => message.status === 'PENDING')
    )
      return;
    // Stop/disconnect persistence can finish just after the aborted fetch. Reconcile until finalized.
    const timer = setTimeout(refresh, 500);
    return () => clearTimeout(timer);
  }, [initial, enabled, busy, refresh]);

  const messages: Message[] = sdk.messages.map((message, index) => {
    const text = message.parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('');
    const isLast = index === sdk.messages.length - 1;
    const status =
      message.role === 'user'
        ? 'COMPLETED'
        : isLast &&
            lastSend.current === message.metadata?.clientMessageId &&
            !busy &&
            (sdk.error || stopped === lastSend.current)
          ? 'FAILED'
          : (message.metadata?.status ??
            (isLast && busy ? 'PENDING' : 'COMPLETED'));
    return {
      id: message.id,
      role: message.role === 'user' ? 'USER' : 'ASSISTANT',
      plainText: text,
      contentJson:
        status === 'PENDING'
          ? paragraph(text)
          : (documents.current.get(message.id) ?? paragraph(text)),
      status,
      clientMessageId: message.metadata?.clientMessageId,
      modelId: message.metadata?.modelId,
      failureCode:
        stopped && stopped === message.metadata?.clientMessageId
          ? 'STOPPED'
          : message.metadata?.failureCode,
    };
  });
  if (
    sdk.messages.at(-1)?.role === 'user' &&
    (busy || sdk.error || (stopped !== null && stopped === lastSend.current))
  ) {
    messages.push({
      id: `pending-${lastSend.current}`,
      role: 'ASSISTANT',
      contentJson: paragraph(''),
      plainText: '',
      status: busy ? 'PENDING' : 'FAILED',
      failureCode: stopped ? 'STOPPED' : undefined,
    });
  }
  function send(
    contentJson: RichDocument,
    clientMessageId: string = crypto.randomUUID(),
  ) {
    if (!chatId || !enabled || busy || sending.current) return false;
    sending.current = true;
    lastSend.current = clientMessageId;
    setStopped(null);
    setStopError(undefined);
    sdk.clearError();
    documents.current.set(clientMessageId, contentJson);
    void sdk
      .sendMessage(
        {
          id: clientMessageId,
          role: 'user',
          parts: [{ type: 'text', text: textOf(contentJson) }],
          metadata: { clientMessageId },
        },
        { body: { clientMessageId, contentJson } },
      )
      .finally(() => {
        sending.current = false;
      });
    return true;
  }
  function retry(messageId?: string) {
    if (busy || sending.current) return;
    const index = messageId
      ? messages.findIndex((message) => message.id === messageId)
      : messages.length - 1;
    const original = messages
      .slice(0, index)
      .reverse()
      .find((message) => message.role === 'USER');
    const clientMessageId = original?.clientMessageId;
    if (!original?.contentJson || !clientMessageId) return;
    sending.current = true;
    lastSend.current = clientMessageId;
    setStopped(null);
    setStopError(undefined);
    sdk.clearError();
    const exists = sdk.messages.some((message) => message.id === messageId);
    if (messageId) documents.current.delete(messageId);
    void sdk
      .regenerate({
        ...(exists ? { messageId } : {}),
        body: { clientMessageId, contentJson: original.contentJson },
      })
      .finally(() => {
        sending.current = false;
      });
  }
  return {
    messages:
      enabled && hydrated.current ? messages : (initial?.messages ?? []),
    busy,
    error: stopError ?? sdk.error?.message,
    send,
    retry,
    stop: () => {
      if (!streaming || stopRequested) return;
      setStopped(lastSend.current);
      setStopError(undefined);
      // Queue an early Stop until the server announces this attempt's generation ID.
      // Keep reading until the explicit request reaches the server through proxies.
      setStopRequested(true);
    },
  };
}
