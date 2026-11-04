import type {
  Chat,
  ChatService,
  ChatSummary,
  RichDocument,
} from '../../lib/types';

export type PreviewOutcome = 'normal' | 'fail-before' | 'fail-during';
export type PreviewGeneration =
  | { phase: 'idle' }
  | { phase: 'generating' | 'failed' | 'stopped'; messageId: string };
export type PreviewChatSnapshot = { chat: Chat; generation: PreviewGeneration };

/** Preview-only behavior. Production HTTP contracts deliberately stay unchanged. */
export interface PreviewChatService extends ChatService {
  subscribe(listener: () => void): () => void;
  getChatSnapshot(id: string): PreviewChatSnapshot | undefined;
  getListSnapshot(): ChatSummary[];
  send(id: string, content: RichDocument, outcome: PreviewOutcome): void;
  retry(id: string, outcome: PreviewOutcome): void;
  stop(id: string): void;
  dispose(): void;
}
