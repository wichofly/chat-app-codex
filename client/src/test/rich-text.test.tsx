import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RichText } from '../components/RichText'

describe('read-only rich text', () => {
  it('escapes text, ignores unsafe nodes, and rejects unsafe links', () => {
    const { container } = render(<RichText document={{ type: 'doc', content: [
      { type: 'paragraph', content: [
        { type: 'text', text: '<script>alert(1)</script>' },
        { type: 'text', text: 'Unsafe link', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
        { type: 'text', text: 'Safe link', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
      ] },
      { type: 'image', attrs: { src: 'x', onerror: 'alert(1)' } },
    ] }} />)
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText(/<script>alert/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Unsafe link' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Safe link' })).toHaveAttribute('href', 'https://example.com/')
  })
})
