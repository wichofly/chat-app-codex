import {
  ArrowUpRight,
  BookOpen,
  Lightbulb,
  LockKeyhole,
  MessageSquare,
  PencilLine,
  Share2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useApp } from '../../app/providers';
import { ThreadMark } from '../../components/Brand';
import { ChatActionsDialog } from '../../components/ChatActionsDialog';
import { Composer } from '../../components/Composer';
import { MessageList } from '../../components/MessageList';
import {
  ConversationSkeleton,
  ErrorState,
  NotFound,
} from '../../components/States';
import { ApiError } from '../../lib/api';
import type { RichDocument } from '../../lib/types';
import { useDocumentTitle } from '../../lib/use-document-title';
import { useResource } from '../../lib/use-resource';
import { ShareDialog } from '../sharing/ShareDialog';
import { useLiveChat } from './use-live-chat';
import { usePreviewChat } from './use-preview';

const suggestions = [
  {
    Icon: Lightbulb,
    label: 'Find a fresh angle',
    description: 'Give an idea a little room to grow',
    prompt:
      'Help me brainstorm a small creative project I can finish this weekend.',
  },
  {
    Icon: PencilLine,
    label: 'Find the right words',
    description: 'From a rough thought to a first draft',
    prompt:
      'Help me turn a rough idea into a clear first draft. What should I start with?',
  },
  {
    Icon: BookOpen,
    label: 'Make sense of something',
    description: 'Go from “wait, what?” to “got it”',
    prompt: 'How can I make learning something new feel less overwhelming?',
  },
];

export function ChatPage() {
  const { chatId } = useParams();
  const { service, revision, refresh, previewService, previewOutcome, notify } =
    useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const consumedPrompt = useRef<string | null>(null);
  const resource = useResource(
    () =>
      chatId && !previewService
        ? service.getChat(chatId)
        : Promise.resolve(null),
    [service, chatId, revision],
  );
  const snapshot = usePreviewChat(chatId);
  const chat = previewService ? snapshot?.chat : resource.data;
  const loading = !previewService && !!chatId && resource.loading;
  const error = previewService
    ? chatId && !snapshot
      ? new ApiError('Conversation not found.', 404)
      : null
    : resource.error;
  const live = useLiveChat(chatId, chat, !previewService, refresh);
  const displayedMessages = previewService
    ? (chat?.messages ?? [])
    : live.messages;
  const generating =
    live.busy ||
    snapshot?.generation.phase === 'generating' ||
    !!chat?.messages.some((message) => message.status === 'PENDING');
  const [sharing, setSharing] = useState(false);
  const [rename, setRename] = useState(false);
  const [prompt, setPrompt] = useState<{ text: string; key: number }>();
  useEffect(() => {
    setPrompt(undefined);
    setSharing(false);
    setRename(false);
  }, [chatId]);
  useEffect(() => {
    const state: unknown = location.state;
    if (
      previewService ||
      !chatId ||
      loading ||
      error ||
      !state ||
      typeof state !== 'object' ||
      !('pendingPrompt' in state)
    )
      return;
    const pending = state.pendingPrompt;
    if (
      !pending ||
      typeof pending !== 'object' ||
      !('clientMessageId' in pending) ||
      typeof pending.clientMessageId !== 'string' ||
      !('contentJson' in pending)
    )
      return;
    const document = pending.contentJson;
    if (
      !document ||
      typeof document !== 'object' ||
      !('type' in document) ||
      document.type !== 'doc' ||
      consumedPrompt.current === pending.clientMessageId
    )
      return;
    const clientMessageId = pending.clientMessageId;
    const contentJson: RichDocument = { ...document, type: 'doc' };
    // Submit only after the mounted effect survives StrictMode's setup/cleanup cycle.
    const timer = setTimeout(() => {
      if (live.send(contentJson, clientMessageId)) {
        consumedPrompt.current = clientMessageId;
        navigate(location.pathname, { replace: true, state: null });
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [
    location.state,
    location.pathname,
    chatId,
    loading,
    error,
    previewService,
    live.send,
    navigate,
  ]);
  useDocumentTitle(
    error ? 'Conversation unavailable' : chat?.title || 'Your space',
  );
  async function send(content: RichDocument) {
    if (!previewService) {
      if (chatId) return live.send(content);
      const created = await service.createChat();
      refresh();
      navigate(`/chats/${created.id}`, {
        state: {
          pendingPrompt: {
            contentJson: content,
            clientMessageId: crypto.randomUUID(),
          },
        },
      });
      return true;
    }
    const targetId = chatId ?? (await previewService.createChat()).id;
    previewService.send(targetId, content, previewOutcome);
    if (!chatId) navigate(`/chats/${targetId}`);
    return true;
  }
  function retry() {
    try {
      if (previewService && chatId)
        previewService.retry(chatId, previewOutcome);
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : 'Could not retry this response.',
        true,
      );
    }
  }
  if (error instanceof ApiError && error.status === 404)
    return <NotFound nested />;
  if (error) return <ErrorState message={error.message} retry={refresh} />;
  const hasMessages = displayedMessages.length > 0;
  return (
    <div className="chat-page">
      <header className="chat-header">
        <div className="chat-heading">
          {chat ? (
            <>
              <h1>{chat.title}</h1>
              <button
                className="icon-button title-rename"
                aria-label="Rename conversation"
                disabled={loading}
                onClick={() => setRename(true)}
              >
                <PencilLine size={14} />
              </button>
            </>
          ) : (
            <span className="header-label">
              {loading ? 'Loading conversation…' : 'Your space to think'}
            </span>
          )}
        </div>
        <div className="chat-header-actions">
          <span className="private-label">
            <LockKeyhole size={13} />
            Private
          </span>
          {chat && (
            <button
              className="button button-secondary share-button"
              disabled={loading}
              onClick={() => setSharing(true)}
            >
              <Share2 size={14} />
              Share
            </button>
          )}
        </div>
      </header>
      <div
        className={`chat-content ${hasMessages ? 'chat-content-conversation' : ''}`}
      >
        {loading && chatId ? (
          <ConversationSkeleton />
        ) : hasMessages ? (
          <>
            <div className="conversation-intro">
              <span className="eyebrow">
                <MessageSquare size={12} />A THOUGHT IN PROGRESS
              </span>
            </div>
            <MessageList
              messages={displayedMessages}
              preview={!!previewService}
              generation={snapshot?.generation}
              onRetry={previewService ? retry : live.retry}
            />
          </>
        ) : (
          <section className="welcome">
            <div className="welcome-mark">
              <ThreadMark />
              <span className="welcome-spark" aria-hidden="true">
                ✳
              </span>
            </div>
            <span className="eyebrow">A CLEAR SPACE. A FRESH PERSPECTIVE.</span>
            <h1>
              Where shall we
              <br className="mobile-break" /> go from here?
            </h1>
            <p>
              Bring a question, an idea, or a thought that isn’t quite there
              yet.
              <br className="desktop-break" /> We’ll work through it together.
            </p>
            <div className="suggestion-grid">
              {suggestions.map(({ Icon, label, description, prompt: text }) => (
                <button
                  className="suggestion-card"
                  key={label}
                  disabled={loading || generating}
                  onClick={() => setPrompt({ text, key: Date.now() })}
                >
                  <div>
                    <span className="suggestion-icon">
                      <Icon size={19} strokeWidth={1.6} />
                    </span>
                    <ArrowUpRight size={16} className="suggestion-arrow" />
                  </div>
                  <strong>{label}</strong>
                  <span>{description}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
      <div className="composer-dock">
        {!previewService && live.error && (
          <div className="send-error" role="alert">
            <p>{live.error}</p>
          </div>
        )}
        <Composer
          key={chatId || 'new-chat'}
          prompt={prompt}
          onSend={send}
          disabled={loading}
          generating={generating}
          onStop={
            previewService && chatId
              ? () => previewService.stop(chatId)
              : live.stop
          }
        />
      </div>
      {sharing && chat && (
        <ShareDialog chatId={chat.id} onClose={() => setSharing(false)} />
      )}
      {rename && chat && (
        <ChatActionsDialog
          chat={chat}
          action="rename"
          onClose={() => setRename(false)}
        />
      )}
    </div>
  );
}
