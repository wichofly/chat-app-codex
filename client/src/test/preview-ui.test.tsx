import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../app/App';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(null)),
  );
});

afterEach(() => vi.useRealTimers());

async function enterPreview() {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/login']}>
      <App />
    </MemoryRouter>,
  );
  await user.click(
    await screen.findByRole('button', { name: 'Explore the UI preview' }),
  );
  // The first route load also imports the editor and chat SDK on a cold worker.
  await screen.findByRole(
    'heading',
    { name: /Where shall we/ },
    { timeout: 5000 },
  );
  expect(screen.queryByRole('combobox', { name: 'Answer style' })).not.toBeInTheDocument();
  return user;
}

async function sendSuggestion(
  user: ReturnType<typeof userEvent.setup>,
  waitForStop = true,
) {
  await user.click(screen.getByRole('button', { name: /Find a fresh angle/ }));
  const send = await screen.findByRole('button', { name: 'Send message' });
  await waitFor(() => expect(send).toBeEnabled());
  await user.click(send);
  if (waitForStop)
    await screen.findByRole('button', { name: 'Stop generation' });
}

describe('interactive preview pages', () => {
  it('creates a chat from the welcome page, preserves generation across navigation, stops and retries', async () => {
    await enterPreview();
    // Keep preview generation active while navigating, independently of CPU load.
    vi.useFakeTimers();
    const click = async (role: 'button' | 'link', name: string | RegExp) => {
      await act(async () => {
        fireEvent.click(screen.getByRole(role, { name }));
        await vi.advanceTimersByTimeAsync(0);
      });
    };
    await click('button', /Find a fresh angle/);
    expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled();
    await click('button', 'Send message');
    const editor = screen.getByRole('textbox', { name: 'Message' });
    expect(editor).toHaveAttribute('contenteditable', 'false');
    expect(screen.getByText('Generating…')).toBeInTheDocument();
    expect(screen.getAllByRole('article', { name: 'You' })).toHaveLength(1);
    await click('link', 'Ideas for a weekend project');
    expect(
      screen.getByRole('heading', {
        name: 'Ideas for a weekend project',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Stop generation' }),
    ).not.toBeInTheDocument();
    await click('link', 'New chat');
    await click('button', 'Stop generation');
    expect(screen.getByText('Generation stopped.')).toBeInTheDocument();
    await click('button', 'Retry response');
    expect(screen.getAllByRole('article', { name: 'You' })).toHaveLength(1);
    expect(
      screen.getAllByRole('article', { name: 'Thread assistant' }),
    ).toHaveLength(1);
    await click('button', 'Stop generation');
    await click('button', 'Close preview');
    await click('button', 'Explore the UI preview');
    expect(screen.getByRole('heading', { name: /Where shall we/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'New chat' }),
    ).not.toBeInTheDocument();
    // Preview generation never calls a model or changes production endpoints.
    expect(
      vi
        .mocked(fetch)
        .mock.calls.every(([url]) => String(url).endsWith('/auth/get-session')),
    ).toBe(true);
  });

  it.each(['fail-before', 'fail-during'])(
    'offers retry after %s and uses the newly selected outcome',
    async (outcome) => {
      const user = await enterPreview();
      await user.selectOptions(
        screen.getByRole('combobox', { name: 'Response' }),
        outcome,
      );
      await sendSuggestion(user, false);
      expect(
        await screen.findByText(
          'This response is incomplete. Generation didn’t finish.',
          {},
          { timeout: 4500 },
        ),
      ).toBeInTheDocument();
      const assistant = screen.getByRole('article', {
        name: 'Thread assistant',
      });
      expect(
        assistant.querySelector('.rich-text')?.textContent.length === 0,
      ).toBe(outcome === 'fail-before');
      expect(
        within(assistant).getByText('UI preview · Sample response'),
      ).toBeInTheDocument();
      await user.selectOptions(
        screen.getByRole('combobox', { name: 'Response' }),
        'normal',
      );
      await user.click(screen.getByRole('button', { name: 'Retry response' }));
      expect(screen.getByText('Generating…')).toBeInTheDocument();
      expect(screen.getAllByRole('article', { name: 'You' })).toHaveLength(1);
      await user.click(screen.getByRole('button', { name: 'Stop generation' }));
    },
    10000,
  );

  it('traps mobile navigation focus, closes on Escape, and restores the menu button', async () => {
    const user = await enterPreview();
    const menu = screen.getByRole('button', { name: 'Open navigation' });
    await user.click(menu);
    const drawer = screen.getByRole('dialog', { name: 'Navigation' });
    expect(
      within(drawer).getByRole('link', { name: 'Thread home' }),
    ).toHaveFocus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(
      within(drawer).getByRole('button', { name: 'Leave preview' }),
    ).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(
      within(drawer).getByRole('link', { name: 'Thread home' }),
    ).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    await user.keyboard('{Escape}');
    expect(menu).toHaveFocus();
    expect(
      screen.queryByRole('dialog', { name: 'Navigation' }),
    ).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
    expect(screen.getByRole('main')).not.toHaveAttribute('inert');
  });

  it('closes the drawer when switching to desktop', async () => {
    let onChange: (() => void) | undefined;
    const media = {
      matches: false,
      addEventListener: (_: string, listener: () => void) => {
        onChange = listener;
      },
      removeEventListener: vi.fn(),
    };
    vi.spyOn(window, 'matchMedia').mockReturnValue(
      media as unknown as MediaQueryList,
    );
    const user = await enterPreview();
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    act(() => {
      media.matches = true;
      onChange?.();
    });
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Navigation' }),
      ).not.toBeInTheDocument(),
    );
    expect(document.body.style.overflow).toBe('');
  });
});
