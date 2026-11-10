import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useEffect, useMemo, useRef, useState } from 'react';
import { baseUrl, request } from '../../lib/api';
import type { Persona } from '../../lib/personas';
import { documentText, paragraph } from '../../lib/rich-text';
import type { Chat, Message, RichDocument } from '../../lib/types';

type Metadata = {
  clientMessageId?: string;
  generationId?: string | null;
  modelId?: string | null;
  status?: Message['status'];
  failureCode?: string | null;
};

type LiveMessage = UIMessage<Metadata>;

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
  persona: Persona = 'assistant',
) {
  const documents = useRef(new Map<string, RichDocument>());
  const hydrated = useRef<Chat | null>(null);
  const sending = useRef(false);
  const lastSend = useRef<string | null>(null);
  const [stopped, setStopped] = useState<string | null>(null);
  const [stopRequest, setStopRequest] = useState<{
    clientMessageId: string;
    generationId: string | null;
  } | null>(null);
  const stopRequested = stopRequest !== null;
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
  const localBusy = streaming || stopRequested;
  const busy =
    localBusy ||
    !!initial?.messages.some((message) => message.status === 'PENDING');
  const latest = sdk.messages.at(-1);
  const generationId =
    stopRequest?.generationId ??
    (latest?.role === 'assistant' &&
    latest.metadata?.clientMessageId === stopRequest?.clientMessageId
      ? latest.metadata?.generationId
      : undefined);
  const stopClientMessageId = stopRequest?.clientMessageId;
  useEffect(() => {
    if (!stopClientMessageId || !chatId || !generationId) return;
    let disposed = false;
    void request<{ stopped: boolean }>(
      `/chats/${encodeURIComponent(chatId)}/messages/stop`,
      {
        method: 'POST',
        body: JSON.stringify({
          clientMessageId: stopClientMessageId,
          generationId,
        }),
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
        if (!disposed) setStopRequest(null);
      });
    return () => {
      disposed = true;
    };
  }, [stopClientMessageId, chatId, generationId, sdk.stop, refresh]);
  useEffect(() => {
    if (!streaming && stopRequested && !generationId) setStopRequest(null);
  }, [streaming, stopRequested, generationId]);
  useEffect(() => {
    documents.current.clear();
    hydrated.current = null;
    lastSend.current = null;
    sending.current = false;
    setStopRequest(null);
    setStopError(undefined);
    return () => {
      void sdk.stop();
    };
  }, [chatId]);
  useEffect(() => {
    if (!enabled || !initial || initial === hydrated.current || localBusy)
      return;
    hydrated.current = initial;
    for (const message of initial.messages)
      if (message.contentJson)
        documents.current.set(message.id, message.contentJson);
    sdk.setMessages(initial.messages.map(toUI));
  }, [initial, enabled, localBusy, sdk.setMessages]);
  useEffect(() => {
    if (
      !enabled ||
      localBusy ||
      !initial?.messages.some((message) => message.status === 'PENDING')
    )
      return;
    // Stop/disconnect persistence can finish just after the aborted fetch. Reconcile until finalized.
    const timer = setTimeout(refresh, 500);
    return () => clearTimeout(timer);
  }, [initial, enabled, localBusy, refresh]);

  const messages: Message[] = sdk.messages.map((message, index) => {
    const text = message.parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('');
    const isLast = index === sdk.messages.length - 1;
    let status =
      message.metadata?.status ?? (isLast && busy ? 'PENDING' : 'COMPLETED');
    if (message.role === 'user') status = 'COMPLETED';
    else if (
      isLast &&
      lastSend.current === message.metadata?.clientMessageId &&
      !busy &&
      (sdk.error || stopped === lastSend.current)
    )
      status = 'FAILED';
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
  function prepareGeneration(clientMessageId: string) {
    sending.current = true;
    lastSend.current = clientMessageId;
    setStopped(null);
    setStopError(undefined);
    sdk.clearError();
  }
  function send(
    contentJson: RichDocument,
    clientMessageId: string = crypto.randomUUID(),
    selectedPersona: Persona = persona,
  ) {
    if (!chatId || !enabled || busy || sending.current) return false;
    prepareGeneration(clientMessageId);
    documents.current.set(clientMessageId, contentJson);
    void sdk
      .sendMessage(
        {
          id: clientMessageId,
          role: 'user',
          parts: [{ type: 'text', text: documentText(contentJson) }],
          metadata: { clientMessageId },
        },
        { body: { clientMessageId, contentJson, persona: selectedPersona } },
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
    prepareGeneration(clientMessageId);
    const exists = sdk.messages.some((message) => message.id === messageId);
    if (messageId) documents.current.delete(messageId);
    void sdk
      .regenerate({
        ...(exists ? { messageId } : {}),
        body: { clientMessageId, contentJson: original.contentJson, persona },
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
      if (stopRequested || !enabled) return;
      const clientMessageId = streaming
        ? lastSend.current
        : initial?.activeGeneration?.clientMessageId;
      if (!clientMessageId) return;
      const targetGenerationId = streaming
        ? latest?.role === 'assistant' &&
          latest.metadata?.clientMessageId === clientMessageId
          ? latest.metadata.generationId
          : null
        : initial?.activeGeneration?.generationId;
      setStopped(clientMessageId);
      setStopError(undefined);
      // Queue an early Stop until the server announces this attempt's generation ID.
      // Keep reading until the explicit request reaches the server through proxies.
      setStopRequest({
        clientMessageId,
        generationId: targetGenerationId ?? null,
      });
    },
  };
}
