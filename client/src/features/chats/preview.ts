import { ApiError } from '../../lib/api';
import {
  paragraph,
  type Chat,
  type Message,
  type RichDocument,
  type ShareState,
  type Snapshot,
} from '../../lib/types';
import type {
  PreviewChatService,
  PreviewChatSnapshot,
  PreviewGeneration,
  PreviewOutcome,
} from './preview-types';

const now = new Date().toISOString();
const fixture: Chat[] = [
  {
    id: 'a-fresh-perspective',
    title: 'A fresh perspective on learning',
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: 'm1',
        role: 'USER',
        status: 'COMPLETED',
        plainText:
          'How can I make learning something new feel less overwhelming?',
        contentJson: paragraph(
          'How can I make learning something new feel less overwhelming?',
        ),
      },
      {
        id: 'm2',
        role: 'ASSISTANT',
        status: 'COMPLETED',
        plainText: 'Start smaller than you think you need to.',
        contentJson: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Start smaller than you think you need to. You don’t need a perfect plan — just a next step you’re curious enough to take.',
                },
              ],
            },
            {
              type: 'heading',
              attrs: { level: 3 },
              content: [
                {
                  type: 'text',
                  text: 'Try a little less, a little more often',
                },
              ],
            },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    paragraph(
                      'Pick one small question. Replace “learn everything about it” with “understand this one thing.”',
                    ).content![0],
                  ],
                },
                {
                  type: 'listItem',
                  content: [
                    paragraph(
                      'Make room for 15 minutes. A small, repeatable habit beats an ambitious plan you can’t keep.',
                    ).content![0],
                  ],
                },
                {
                  type: 'listItem',
                  content: [
                    paragraph(
                      'Explain it in your own words. The gaps you notice tell you exactly what to explore next.',
                    ).content![0],
                  ],
                },
              ],
            },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'What’s something you’ve been wanting to learn?',
                },
              ],
            },
          ],
        },
      },
    ],
  },
  {
    id: 'weekend-project',
    title: 'Ideas for a weekend project',
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: 'm3',
        role: 'USER',
        status: 'COMPLETED',
        plainText: 'Help me brainstorm a small creative project.',
        contentJson: paragraph('Help me brainstorm a small creative project.'),
      },
      {
        id: 'm4',
        role: 'ASSISTANT',
        status: 'COMPLETED',
        plainText: 'How about a tiny field guide to your neighborhood?',
        contentJson: paragraph(
          'How about a tiny field guide to your neighborhood? Take a walk, collect five things you usually overlook, and give each a page. A sketch, a sentence, or a photo is enough. You could also build a little website to share what you find.',
        ),
      },
    ],
  },
  {
    id: 'a-clearer-first-draft',
    title: 'Finding the words for a first draft',
    createdAt: '2026-10-20T10:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z',
    messages: [],
  },
];

export const SAMPLE_RESPONSE =
  'This is a simulated response for the UI preview, not an AI-generated answer. Try breaking your idea into one small next step, writing down what you want to explore, and giving yourself a little room to experiment. You can stop this sample response, retry it, or choose a failure scenario in the preview controls.';
const words = SAMPLE_RESPONSE.split(' ');
const chunks = Array.from({ length: Math.ceil(words.length / 4) }, (_, i) =>
  words.slice(i * 4, i * 4 + 4).join(' '),
);

function plainText(document: RichDocument): string {
  if (document.type === 'text') return document.text || '';
  if (document.type === 'hardBreak') return '\n';
  return (document.content || [])
    .map(plainText)
    .join(
      ['doc', 'bulletList', 'orderedList'].includes(document.type || '')
        ? '\n'
        : '',
    );
}

export function createPreviewService(): PreviewChatService {
  const chats = new Map<string, PreviewChatSnapshot>(
    structuredClone(fixture).map((chat) => [
      chat.id,
      { chat, generation: { phase: 'idle' } },
    ]),
  );
  const listeners = new Set<() => void>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const shares = new Map<string, { chatId: string; snapshot: Snapshot }>();
  let disposed = false;
  const summaries = () =>
    [...chats.values()]
      .map(({ chat: { messages: _messages, ...summary } }) => summary)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  let list = summaries();
  const emit = () => listeners.forEach((listener) => listener());
  const assertActive = () => {
    if (disposed)
      throw new ApiError(
        'This preview has ended. Open a new preview to continue.',
        409,
      );
  };
  const find = (id: string) => {
    assertActive();
    const snapshot = chats.get(id);
    if (!snapshot) throw new ApiError('Conversation not found.', 404);
    return snapshot;
  };
  const update = (
    id: string,
    chat: Chat,
    generation = find(id).generation,
    updateList = false,
  ) => {
    chats.set(id, { chat, generation });
    if (updateList) list = summaries();
    emit();
  };
  const makeSnapshot = (chat: Chat): Snapshot => ({
    title: chat.title,
    messages: structuredClone(
      chat.messages
        .filter((m) => m.status === 'COMPLETED')
        .map(({ role, contentJson }) => ({ role, contentJson })),
    ),
    sharedAt: new Date().toISOString(),
  });
  const first = fixture[0];
  shares.set('demo', { chatId: first.id, snapshot: makeSnapshot(first) });
  const revoke = (id: string) => {
    for (const [token, share] of shares)
      if (share.chatId === id) shares.delete(token);
  };
  const shareState = (id: string): ShareState => {
    const entry = [...shares.entries()].find(
      ([, share]) => share.chatId === id,
    );
    return entry
      ? {
          url: `${window.location.origin}/shared/${entry[0]}`,
          sharedAt: entry[1].snapshot.sharedAt,
        }
      : { url: null };
  };
  function cancelTimer(id: string) {
    clearTimeout(timers.get(id));
    timers.delete(id);
  }
  function finish(id: string, phase: PreviewGeneration['phase']) {
    cancelTimer(id);
    const { chat, generation } = find(id);
    update(
      id,
      {
        ...chat,
        updatedAt: new Date().toISOString(),
        messages: chat.messages.map((message) =>
          message.id === generation.messageId
            ? { ...message, status: phase === 'idle' ? 'COMPLETED' : 'FAILED' }
            : message,
        ),
      },
      { ...generation, phase },
      true,
    );
  }
  function begin(id: string, messageId: string, outcome: PreviewOutcome) {
    let index = 0;
    const tick = () => {
      if (disposed || !chats.has(id)) return;
      if (
        outcome === 'fail-before' ||
        (outcome === 'fail-during' && index === Math.ceil(chunks.length / 2))
      ) {
        finish(id, 'failed');
        return;
      }
      const { chat, generation } = find(id);
      const text = chunks.slice(0, ++index).join(' ');
      update(
        id,
        {
          ...chat,
          messages: chat.messages.map((message) =>
            message.id === messageId
              ? { ...message, plainText: text, contentJson: paragraph(text) }
              : message,
          ),
        },
        generation,
      );
      if (index === chunks.length) finish(id, 'idle');
      else timers.set(id, setTimeout(tick, 250));
    };
    timers.set(id, setTimeout(tick, 400));
  }
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getChatSnapshot: (id) => chats.get(id),
    getListSnapshot: () => list,
    listChats: async () => {
      assertActive();
      return structuredClone(list);
    },
    getChat: async (id) => structuredClone(find(id).chat),
    createChat: async () => {
      assertActive();
      const date = new Date().toISOString();
      const chat = {
        id: crypto.randomUUID(),
        title: 'New chat',
        createdAt: date,
        updatedAt: date,
        messages: [],
      };
      update(chat.id, chat, { phase: 'idle' }, true);
      return structuredClone(chat);
    },
    renameChat: async (id, title) => {
      if (!title.trim() || [...title.trim()].length > 100)
        throw new ApiError('Use between 1 and 100 characters.', 400);
      update(
        id,
        {
          ...find(id).chat,
          title: title.trim(),
          updatedAt: new Date().toISOString(),
        },
        undefined,
        true,
      );
    },
    deleteChat: async (id) => {
      find(id);
      cancelTimer(id);
      chats.delete(id);
      revoke(id);
      list = summaries();
      emit();
    },
    getShare: async (id) => {
      find(id);
      return shareState(id);
    },
    createShare: async (id) => {
      const { chat } = find(id);
      revoke(id);
      shares.set(crypto.randomUUID(), {
        chatId: id,
        snapshot: makeSnapshot(chat),
      });
      return shareState(id);
    },
    revokeShare: async (id) => {
      find(id);
      revoke(id);
    },
    getSnapshot: async (token) => {
      const share = shares.get(token);
      if (!share) throw new ApiError('Shared conversation not found.', 404);
      return structuredClone(share.snapshot);
    },
    send: (id, content, outcome) => {
      const { chat, generation } = find(id);
      if (generation.phase === 'generating')
        throw new ApiError(
          'A response is already generating in this conversation.',
          409,
        );
      const text = plainText(content).trim();
      if (!text || text.length > 6000)
        throw new ApiError('Enter a message of 1–6,000 characters.', 400);
      const assistantId = crypto.randomUUID();
      const messages: Message[] = [
        ...chat.messages,
        {
          id: crypto.randomUUID(),
          role: 'USER',
          contentJson: structuredClone(content),
          plainText: text,
          status: 'COMPLETED',
        },
        {
          id: assistantId,
          role: 'ASSISTANT',
          contentJson: null,
          plainText: '',
          status: 'PENDING',
        },
      ];
      update(
        id,
        { ...chat, messages, updatedAt: new Date().toISOString() },
        { phase: 'generating', messageId: assistantId },
        true,
      );
      begin(id, assistantId, outcome);
    },
    retry: (id, outcome) => {
      const { chat, generation } = find(id);
      const last = chat.messages.at(-1);
      if (
        !last ||
        !['failed', 'stopped'].includes(generation.phase) ||
        last.id !== generation.messageId ||
        last.status !== 'FAILED'
      )
        throw new ApiError('This response cannot be retried.', 409);
      update(
        id,
        {
          ...chat,
          messages: chat.messages.map((message) =>
            message.id === last.id
              ? {
                  ...message,
                  contentJson: null,
                  plainText: '',
                  status: 'PENDING',
                }
              : message,
          ),
        },
        { phase: 'generating', messageId: last.id },
      );
      begin(id, last.id, outcome);
    },
    stop: (id) => {
      if (find(id).generation.phase === 'generating') finish(id, 'stopped');
    },
    dispose: () => {
      disposed = true;
      timers.forEach(clearTimeout);
      timers.clear();
      shares.clear();
      chats.clear();
      list = [];
      emit();
      listeners.clear();
    },
  };
}
