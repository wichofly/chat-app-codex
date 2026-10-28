import { AlertCircle, UserRound } from 'lucide-react';
import type { Message } from '../lib/types';
import { ThreadMark } from './Brand';
import { RichText } from './RichText';
import type { PreviewGeneration } from '../features/chats/preview-types';

type DisplayMessage = Pick<Message, 'role' | 'contentJson'> &
  Partial<Pick<Message, 'id' | 'status' | 'modelId'>>;

export function MessageList({ messages, generation, onRetry, preview = false }: {
  messages: DisplayMessage[];
  generation?: PreviewGeneration;
  onRetry?: () => void;
  preview?: boolean;
}) {
  return (
    <div className="message-list" aria-label="Conversation messages">
      {messages.map((message, index) => (
        <article
          key={message.id ?? index}
          className={`message message-${message.role.toLowerCase()}`}
          aria-label={message.role === 'USER' ? 'You' : 'Thread assistant'}
        >
          <div className="message-heading">
            {message.role === 'ASSISTANT' ? (
              <ThreadMark small />
            ) : (
              <span className="message-user-icon">
                <UserRound size={15} />
              </span>
            )}
            <strong>{message.role === 'USER' ? 'You' : 'Thread'}</strong>
            {message.modelId && (
              <span className="model-label">{message.modelId}</span>
            )}
            {preview && message.role === 'ASSISTANT' && <span className="model-label">UI preview · Sample response</span>}
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
              <div className="message-failure"><p className="message-failed" role="alert">
                <AlertCircle size={16} />
                {generation?.messageId === message.id && generation.phase === 'stopped' ? 'Generation stopped.' : 'This response is incomplete. Generation didn’t finish.'}
              </p>
              {onRetry && generation?.messageId === message.id && ['failed', 'stopped'].includes(generation.phase) && <button className="button button-secondary retry-button" onClick={onRetry}>Retry response</button>}</div>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
