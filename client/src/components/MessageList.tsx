import { AlertCircle, UserRound } from 'lucide-react';
import type { PreviewGeneration } from '../features/chats/preview-types';
import type { Message } from '../lib/types';
import { ThreadMark } from './Brand';
import { RichText } from './RichText';

type DisplayMessage = Pick<Message, 'role' | 'contentJson'> &
  Partial<Pick<Message, 'id' | 'status' | 'modelId' | 'failureCode'>>;

export function MessageList({
  messages,
  generation,
  onRetry,
  preview = false,
}: {
  messages: DisplayMessage[];
  generation?: PreviewGeneration;
  onRetry?: (messageId?: string) => void;
  preview?: boolean;
}) {
  return (
    <div className="message-list" aria-label="Conversation messages">
      {messages.map((message, index) => {
        const isAssistant = message.role === 'ASSISTANT';
        const currentGeneration =
          generation &&
          generation.phase !== 'idle' &&
          generation.messageId === message.id
            ? generation
            : undefined;
        const isStopped =
          message.failureCode === 'STOPPED' ||
          currentGeneration?.phase === 'stopped';
        const canRetry =
          currentGeneration?.phase === 'failed' ||
          currentGeneration?.phase === 'stopped' ||
          (!preview && index === messages.length - 1);

        return (
          <article
            key={message.id ?? index}
            className={`message message-${message.role.toLowerCase()}`}
            aria-label={isAssistant ? 'Thread assistant' : 'You'}
          >
            <div className="message-heading">
              {isAssistant ? (
                <ThreadMark small />
              ) : (
                <span className="message-user-icon">
                  <UserRound size={15} />
                </span>
              )}
              <strong>{isAssistant ? 'Thread' : 'You'}</strong>
              {message.modelId && (
                <span className="model-label">{message.modelId}</span>
              )}
              {preview && isAssistant && (
                <span className="model-label">
                  UI preview · Sample response
                </span>
              )}
            </div>
            <div className="message-body">
              <RichText document={message.contentJson} />
              {message.status === 'PENDING' && (
                <div className="generation-status" role="status">
                  <span className="typing-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  Generating…
                </div>
              )}
              {message.status === 'FAILED' && (
                <div className="message-failure">
                  <p className="message-failed" role="alert">
                    <AlertCircle size={16} />
                    {isStopped
                      ? 'Generation stopped.'
                      : 'This response is incomplete. Generation didn’t finish.'}
                  </p>
                  {onRetry && canRetry && (
                    <button
                      className="button button-secondary retry-button"
                      onClick={() => onRetry(message.id)}
                    >
                      Retry response
                    </button>
                  )}
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
