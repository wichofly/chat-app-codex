import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Composer } from '../components/Composer'

describe('composer state controls', () => {
  it('honors externally disabled and generating states and exposes Stop', async () => {
    const onSend = vi.fn(async () => true)
    const onStop = vi.fn()
    const { rerender } = render(<Composer onSend={onSend} disabled />)
    const editor = await screen.findByRole('textbox', { name: 'Message' })
    expect(editor).toHaveAttribute('contenteditable', 'false')
    expect(screen.getByRole('button', { name: 'Bold' })).toBeDisabled()
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
    rerender(<Composer onSend={onSend} generating onStop={onStop} />)
    expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Stop generation' }))
    expect(onStop).toHaveBeenCalledOnce()
    rerender(<Composer onSend={onSend} />)
    expect(editor).toHaveAttribute('contenteditable', 'true')
  })

  it('does not submit Enter during composition and clears an accepted suggestion once', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn(async () => true)
    render(<Composer onSend={onSend} prompt={{ text: 'A suggested question', key: 1 }} />)
    const editor = await screen.findByRole('textbox', { name: 'Message' })
    await waitFor(() => expect(editor).toHaveTextContent('A suggested question'))
    fireEvent.keyDown(editor, { key: 'Enter', isComposing: true })
    expect(onSend).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() => expect(editor).not.toHaveTextContent('A suggested question'))
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  })

  it('preserves a failed draft, reports the error, and blocks over-limit text', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn(async () => { throw new Error('Service unavailable. Your draft is still here.') })
    const { rerender } = render(<Composer onSend={onSend} prompt={{ text: 'Keep this draft', key: 1 }} />)
    await user.click(await screen.findByRole('button', { name: 'Send message' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable.')
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveTextContent('Keep this draft')
    rerender(<Composer onSend={onSend} prompt={{ text: 'a'.repeat(6001), key: 2 }} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled())
    expect(screen.getByText(/Please keep your message under/)).toBeInTheDocument()
  })
})
