import type { JSONContent } from '@tiptap/react';

export type RichDocument = JSONContent;
export type User = { id: string; name: string; email: string };
export type ChatSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};
export type Message = {
  id: string;
  role: 'USER' | 'ASSISTANT';
  contentJson: RichDocument | null;
  plainText: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  modelId?: string | null;
  clientMessageId?: string | null;
  failureCode?: string | null;
};
export type ActiveGeneration = {
  clientMessageId: string;
  generationId: string;
};
export type Chat = ChatSummary & {
  messages: Message[];
  activeGeneration?: ActiveGeneration | null;
};
export type Snapshot = {
  title: string;
  messages: Pick<Message, 'role' | 'contentJson'>[];
  sharedAt: string;
};
export type ShareState = { url: string | null; sharedAt?: string };
export interface ChatService {
  listChats(): Promise<ChatSummary[]>;
  getChat(id: string): Promise<Chat>;
  createChat(): Promise<ChatSummary>;
  renameChat(id: string, title: string): Promise<void>;
  deleteChat(id: string): Promise<void>;
  getShare(id: string): Promise<ShareState>;
  createShare(id: string): Promise<ShareState>;
  revokeShare(id: string): Promise<void>;
  getSnapshot(token: string): Promise<Snapshot>;
}
