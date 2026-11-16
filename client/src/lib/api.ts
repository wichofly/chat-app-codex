import type {
  Chat,
  ChatService,
  ChatSummary,
  ChatListPage,
  ShareState,
  Snapshot,
} from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export const baseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(
  /\/$/,
  '',
);

async function requestEnvelope<T>(
  path: string,
  init: RequestInit = {},
  unwrap = false,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(
      'Unable to reach the server. Check your connection and try again.',
      0,
    );
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401)
      window.dispatchEvent(new Event('thread:session-expired'));
    throw new ApiError(
      body?.error?.message ||
        body?.message ||
        'Something went wrong. Please try again.',
      response.status,
    );
  }
  return unwrap ? (body?.data ?? body) : body;
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  return requestEnvelope<T>(path, init, true);
}

const path = (id: string) => `/chats/${encodeURIComponent(id)}`;

export const api: ChatService = {
  listChats: () => request<ChatSummary[]>('/chats'),
  listChatPage: async (cursor): Promise<ChatListPage> => {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const page = await requestEnvelope<{
      data: ChatSummary[];
      nextCursor?: string | null;
    }>(`/chats${query}`);
    return { chats: page.data, nextCursor: page.nextCursor ?? null };
  },
  getChat: (id) => request<Chat>(path(id)),
  createChat: () =>
    request<ChatSummary>('/chats', { method: 'POST', body: '{}' }),
  renameChat: async (id, title) => {
    await request(path(id), {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
  },
  deleteChat: async (id) => {
    await request(path(id), { method: 'DELETE' });
  },
  getShare: (id) => request<ShareState>(`${path(id)}/share`),
  createShare: (id) =>
    request<ShareState>(`${path(id)}/share`, { method: 'POST', body: '{}' }),
  revokeShare: async (id) => {
    await request(`${path(id)}/share`, { method: 'DELETE' });
  },
  getSnapshot: (token) =>
    request<Snapshot>(`/shared/${encodeURIComponent(token)}`),
};
