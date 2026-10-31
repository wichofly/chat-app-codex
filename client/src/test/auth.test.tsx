import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../app/App';

const userData = {
  id: 'real-user',
  name: 'Alex',
  email: 'alex@example.test',
  emailVerified: false,
  image: null,
  createdAt: '2026-10-28T10:00:00Z',
  updatedAt: '2026-10-28T10:00:00Z',
};
const sessionData = {
  user: userData,
  session: {
    id: 'session',
    userId: userData.id,
    token: 'test-only-token',
    expiresAt: '2099-01-01T00:00:00Z',
    createdAt: '2026-10-28T10:00:00Z',
    updatedAt: '2026-10-28T10:00:00Z',
  },
};
let signedIn = false;
let failLogin = false;
let failLogout = false;
let sessionUnavailable = false;
let failSessionAfterLogout = false;

beforeEach(() => {
  signedIn = false;
  failLogin = false;
  failLogout = false;
  sessionUnavailable = false;
  failSessionAfterLogout = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/auth/get-session')) {
        if (sessionUnavailable)
          return Response.json(
            { message: 'Service unavailable' },
            { status: 503 },
          );
        return Response.json(signedIn ? sessionData : null);
      }
      if (
        url.endsWith('/auth/sign-in/email') ||
        url.endsWith('/auth/sign-up/email')
      ) {
        const payload: unknown = JSON.parse(String(init?.body));
        expect(payload).toMatchObject({
          email: userData.email,
          password: 'test-only-password',
        });
        expect(init?.credentials).toBe('include');
        if (failLogin)
          return Response.json(
            {
              code: 'INVALID_EMAIL_OR_PASSWORD',
              message: 'Invalid email or password',
            },
            { status: 401 },
          );
        signedIn = true;
        return Response.json({ token: 'test-only-token', user: userData });
      }
      if (url.endsWith('/auth/sign-out')) {
        if (failLogout)
          return Response.json(
            { message: 'Please try again.' },
            { status: 503 },
          );
        signedIn = false;
        if (failSessionAfterLogout) sessionUnavailable = true;
        return Response.json({ success: true });
      }
      if (url.endsWith('/chats')) return Response.json({ data: [] });
      return Response.json(
        { error: { message: 'Not found' } },
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

describe('Better Auth frontend integration', () => {
  it.each(['/login', '/signup'])(
    'submits %s using the SDK, enters the workspace, and signs out',
    async (path) => {
      const user = userEvent.setup();
      open(path);
      if (path === '/signup')
        await user.type(await screen.findByLabelText('Your name'), 'Alex');
      await user.type(
        await screen.findByLabelText('Email address'),
        userData.email,
      );
      await user.type(screen.getByLabelText('Password'), 'test-only-password');
      await user.click(
        screen.getByRole('button', {
          name: path === '/signup' ? 'Create account' : 'Sign in',
        }),
      );
      expect(
        await screen.findByRole('heading', { name: /Where shall we/ }),
      ).toBeInTheDocument();
      expect(screen.getByText('Personal account')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Sign out' }));
      // Session reconciliation can remount the guest route; assert on a fresh query.
      await waitFor(() =>
        expect(
          screen.getByRole('heading', { name: 'Welcome back.' }),
        ).toBeInTheDocument(),
      );
    },
  );
  it('restores the server session and redirects away from guest-only pages', async () => {
    signedIn = true;
    open('/login');
    expect(
      await screen.findByRole('heading', { name: /Where shall we/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sign in' }),
    ).not.toBeInTheDocument();
  });
  it('shows credential errors without authenticating', async () => {
    failLogin = true;
    const user = userEvent.setup();
    open('/login');
    await user.type(
      await screen.findByLabelText('Email address'),
      userData.email,
    );
    await user.type(screen.getByLabelText('Password'), 'test-only-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid email or password',
    );
    expect(screen.queryByText('Personal account')).not.toBeInTheDocument();
  });
  it('keeps the session when sign-out fails', async () => {
    signedIn = true;
    failLogout = true;
    const user = userEvent.setup();
    open('/chats');
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not sign out.',
    );
    expect(screen.getByText('Personal account')).toBeInTheDocument();
  });
  it('recovers from session service errors', async () => {
    sessionUnavailable = true;
    const user = userEvent.setup();
    open('/login');
    await screen.findByText(/We couldn’t check your session/);
    signedIn = true;
    sessionUnavailable = false;
    await user.click(
      screen.getByRole('button', { name: 'Check session again' }),
    );
    expect(
      await screen.findByRole('heading', { name: /Where shall we/ }),
    ).toBeInTheDocument();
  });
  it('remains signed out when a post-sign-out session recheck fails', async () => {
    signedIn = true;
    failSessionAfterLogout = true;
    const user = userEvent.setup();
    open('/chats');
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(
      await screen.findByRole('heading', { name: 'Welcome back.' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Personal account')).not.toBeInTheDocument();
  });
  it('rechecks and clears an expired session after a private API 401', async () => {
    signedIn = true;
    const originalFetch = vi.mocked(fetch).getMockImplementation();
    if (!originalFetch) throw new Error('Missing test fetch implementation');
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input).endsWith('/chats')) {
        signedIn = false;
        return Response.json(
          { error: { code: 'UNAUTHORIZED', message: 'Please sign in.' } },
          { status: 401 },
        );
      }
      return originalFetch(input, init);
    });
    open('/chats');
    expect(
      await screen.findByRole('heading', { name: 'Welcome back.' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText('Personal account')).not.toBeInTheDocument(),
    );
  });
});
