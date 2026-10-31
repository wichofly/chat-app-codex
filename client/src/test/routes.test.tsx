import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../app/App';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).endsWith('/auth/get-session')) return Response.json(null);
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'Not found.' } },
        { status: 404 },
      );
    }),
  );
});

function open(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('base routes', () => {
  it('redirects guests away from private chats and exposes the signup form', async () => {
    const user = userEvent.setup();
    open('/chats/private-chat');
    expect(
      await screen.findByRole('heading', { name: 'Welcome back.' }),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/chats/'),
      expect.anything(),
    );
    await user.click(screen.getByRole('link', { name: /Create an account/ }));
    expect(
      screen.getByRole('heading', { name: 'A fresh start.' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toBeRequired();
    expect(screen.getByLabelText('Password')).toHaveAttribute('minlength', '8');
    expect(screen.getByText(/no password recovery/)).toBeInTheDocument();
  });

  it('shows a public snapshot without an editor or account metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).endsWith('/auth/get-session')
          ? Response.json(null)
          : Response.json({
              data: {
                title: 'A public thought',
                sharedAt: '2026-10-28T12:00:00Z',
                messages: [
                  {
                    role: 'USER',
                    contentJson: {
                      type: 'doc',
                      content: [
                        {
                          type: 'paragraph',
                          content: [
                            { type: 'text', text: 'A shared question' },
                          ],
                        },
                      ],
                    },
                  },
                ],
              },
            }),
      ),
    );
    const view = open('/shared/valid-token');
    expect(
      await screen.findByRole('heading', { name: 'A public thought' }),
    ).toBeInTheDocument();
    expect(screen.getByText('A shared question')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Send|Rename|Delete|Stop|Retry/ }),
    ).not.toBeInTheDocument();
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
    view.unmount();
    expect(
      document.querySelector('meta[name="robots"]'),
    ).not.toBeInTheDocument();
  });

  it('uses a generic unavailable state for invalid share tokens', async () => {
    open('/shared/revoked');
    expect(
      await screen.findByRole('heading', {
        name: 'This conversation isn’t available',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('renders the catch-all page', async () => {
    open('/somewhere-else');
    expect(
      await screen.findByRole('heading', {
        name: 'Nothing to see here, just yet',
      }),
    ).toBeInTheDocument();
  });

  it('supports preview chat creation, rename, delete confirmation, and sign-out', async () => {
    const user = userEvent.setup();
    open('/login');
    await user.click(
      await screen.findByRole('button', { name: 'Explore the UI preview' }),
    );
    expect(
      await screen.findByRole('heading', { name: /Where shall we/ }, { timeout: 5000 }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New chat' }));
    await screen.findByRole('heading', { name: 'New chat' });
    await user.click(
      screen.getByRole('button', { name: 'Rename conversation' }),
    );
    const dialog = screen.getByRole('dialog');
    await user.clear(within(dialog).getByLabelText('Conversation name'));
    await user.type(
      within(dialog).getByLabelText('Conversation name'),
      'My next idea',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save name' }));
    await screen.findByRole('heading', { name: 'My next idea' });
    await user.click(
      screen.getByRole('button', { name: 'Delete My next idea' }),
    );
    expect(screen.getByText('This can’t be undone.')).toBeInTheDocument();
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(
      screen.getByRole('heading', { name: 'My next idea' }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Delete My next idea' }),
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Delete conversation',
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('link', { name: 'My next idea' }),
      ).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Leave preview' }));
    expect(
      await screen.findByRole('heading', { name: 'Welcome back.' }),
    ).toBeInTheDocument();
  });

  it('shows a recoverable AI error without losing the submitted prompt', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/auth/get-session'))
          return Response.json({
            user: { id: 'user', name: 'Alex', email: 'alex@example.test' },
          });
        if (String(url).endsWith('/messages/stream'))
          return Response.json(
            {
              error: {
                code: 'DAILY_LIMIT',
                message: 'Daily AI limit reached. Try tomorrow.',
              },
            },
            { status: 429 },
          );
        if (String(url).endsWith('/chats/saved'))
          return Response.json({
            data: {
              id: 'saved',
              title: 'Saved conversation',
              createdAt: '',
              updatedAt: '',
              messages: [],
            },
          });
        return Response.json({ data: [] });
      }),
    );
    open('/chats/saved');
    const send = await screen.findByRole('button', { name: 'Send message' });
    expect(send).toBeDisabled();
    await user.click(
      screen.getByRole('button', { name: /Find a fresh angle/ }),
    );
    await waitFor(() => expect(send).toBeEnabled());
    await user.click(send);
    expect(
      await screen.findByText('Daily AI limit reached. Try tomorrow.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'You' })).toHaveTextContent(
      'Help me brainstorm',
    );
    expect(
      screen.getByRole('button', { name: 'Retry response' }),
    ).toBeInTheDocument();
  });
});
