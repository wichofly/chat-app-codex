import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../app/App';
import { paragraph } from '../lib/rich-text';

const session = { user: { id: 'user', name: 'Alex', email: 'alex@example.test' } };
const chat = {
  id: 'created-chat', title: 'New chat', createdAt: '', updatedAt: '', messages: [],
};

describe('answer style selection', () => {
  it.each(['assistant', 'eli5', 'coach'])(
    'carries %s from the welcome composer into the first streamed request',
    async (persona) => {
      const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        if (path.endsWith('/auth/get-session')) return Response.json(session);
        if (path.endsWith('/messages/stream'))
          return Response.json({ error: { message: 'Test provider unavailable.' } }, { status: 503 });
        if (path.endsWith('/chats'))
          return Response.json({ data: init?.method === 'POST' ? chat : [] });
        return Response.json({ data: chat });
      });
      vi.stubGlobal('fetch', fetcher);
      const user = userEvent.setup();
      render(<MemoryRouter initialEntries={['/chats']}><App /></MemoryRouter>);
      const selector = await screen.findByRole('combobox', { name: 'Answer style' }, { timeout: 5000 });
      expect(selector).toHaveValue('assistant');
      expect(within(selector).getAllByRole('option').map(option => option.textContent)).toEqual(['Thread', 'ELI5', 'Coach']);
      await user.selectOptions(selector, persona);
      await user.click(screen.getByRole('button', { name: /Find a fresh angle/ }));
      const send = screen.getByRole('button', { name: 'Send message' });
      await waitFor(() => expect(send).toBeEnabled());
      await user.click(send);
      await waitFor(() => {
        const calls = fetcher.mock.calls.filter(([url]) => String(url).endsWith('/messages/stream'));
        expect(calls).toHaveLength(1);
        expect(JSON.parse(String(calls[0]?.[1]?.body))).toEqual({
          clientMessageId: expect.any(String),
          contentJson: paragraph('Help me brainstorm a small creative project I can finish this weekend.'),
          persona,
        });
      });
      expect(screen.getByRole('combobox', { name: 'Answer style' })).toHaveValue(persona);
      await screen.findByText('Test provider unavailable.');
    },
  );
  it('locks the selector while a saved response is generating', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/auth/get-session')) return Response.json(session);
      if (path.endsWith('/chats')) return Response.json({ data: [] });
      return Response.json({ data: {
        ...chat,
        messages: [{ id: 'pending', role: 'ASSISTANT', status: 'PENDING', plainText: '', contentJson: null }],
      } });
    }));
    render(<MemoryRouter initialEntries={['/chats/created-chat']}><App /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'New chat' }, { timeout: 5000 });
    expect(screen.getByRole('combobox', { name: 'Answer style' })).toBeDisabled();
  });
});
