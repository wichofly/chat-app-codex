import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../app/App'
import { RouteErrorBoundary } from '../components/RouteErrorBoundary'
import { paragraph } from '../lib/types'

const session = { user: { id: 'user', name: 'Alex', email: 'alex@example.test' } }
const chat = { id: 'chat', title: 'Loaded conversation', createdAt: '2026-10-28T12:00:00Z', updatedAt: '2026-10-28T12:00:00Z', messages: [{ id: 'user-message', role: 'USER', status: 'COMPLETED', plainText: 'A saved question', contentJson: paragraph('A saved question') }] }
function open(path: string) { return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>) }

describe('page states', () => {
  it('disables the composer and hides owner actions until a conversation finishes loading', async () => {
    let resolveChat!: (response: Response) => void
    const pending = new Promise<Response>(resolve => { resolveChat = resolve })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/auth/get-session')) return Response.json(session)
      if (url.endsWith('/chats')) return Response.json({ data: [] })
      return pending
    }))
    open('/chats/chat')
    expect(await screen.findByRole('status', { name: 'Loading conversation' })).toBeInTheDocument()
    expect(await screen.findByRole('textbox', { name: 'Message' })).toHaveAttribute('contenteditable', 'false')
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rename conversation' })).not.toBeInTheDocument()
    await act(async () => { resolveChat(Response.json({ data: chat })); await pending })
    expect(await screen.findByRole('heading', { name: 'Loaded conversation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled()
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveAttribute('contenteditable', 'true')
    await waitFor(() => expect(document.title).toBe('Loaded conversation — Thread'))
  })

  it('recovers a conversation load failure with Try again', async () => {
    let attempts = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/auth/get-session')) return Response.json(session)
      if (url.endsWith('/chats')) return Response.json({ data: [] })
      return ++attempts === 1 ? Response.json({ error: { message: 'Temporarily unavailable.' } }, { status: 503 }) : Response.json({ data: chat })
    }))
    const user = userEvent.setup()
    open('/chats/chat')
    expect(await screen.findByRole('alert')).toHaveTextContent('Temporarily unavailable.')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Loaded conversation' })).toBeInTheDocument()
  })

  it('shows a public snapshot loading error and recovers to an empty read-only snapshot', async () => {
    let attempts = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/auth/get-session')) return Response.json(null)
      return ++attempts === 1 ? Response.json({ error: { message: 'Please try again.' } }, { status: 503 }) : Response.json({ data: { title: 'Empty snapshot', sharedAt: '2026-10-28T12:00:00Z', messages: [] } })
    }))
    const user = userEvent.setup()
    open('/shared/snapshot')
    await user.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('This snapshot has no completed messages yet.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Stop|Retry|Rename|Delete|Send/ })).not.toBeInTheDocument()
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
  })

  it('sets titles for auth and unknown pages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(null)))
    const user = userEvent.setup()
    open('/login')
    await screen.findByRole('heading', { name: 'Welcome back.' })
    expect(document.title).toBe('Sign in — Thread')
    await user.click(screen.getByRole('link', { name: /Create an account/ }))
    expect(document.title).toBe('Create account — Thread')
  })

  it('provides an accessible reload fallback for render failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    function Broken(): never { throw new Error('Private internal error') }
    render(<RouteErrorBoundary><Broken /></RouteErrorBoundary>)
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content')
    expect(screen.getByRole('alert')).toHaveTextContent('This page couldn’t load.')
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument()
    expect(screen.queryByText('Private internal error')).not.toBeInTheDocument()
    expect(document.title).toBe('Page unavailable — Thread')
  })
})
