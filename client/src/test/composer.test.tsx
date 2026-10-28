import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Composer } from '../components/Composer'

describe('composer keyboard behavior', () => {
  it('ignores blank messages, inserts a newline with Shift+Enter, and sends JSON with Enter', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn(async () => false)
    render(<Composer onSend={onSend} />)
    const editor = screen.getByRole('textbox', { name: 'Message' })
    await user.click(editor)
    await user.keyboard('   {Enter}')
    expect(onSend).not.toHaveBeenCalled()
    await user.type(editor, 'A question')
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(onSend).not.toHaveBeenCalled()
    expect(editor.querySelector('br')).toBeInTheDocument()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(onSend).toHaveBeenCalledOnce())
    expect(onSend.mock.calls[0]).toEqual([expect.objectContaining({ type: 'doc' })])
    expect(editor).toHaveTextContent('A question')
  })
})
