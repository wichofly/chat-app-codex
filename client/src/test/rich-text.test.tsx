import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RichText } from '../components/RichText';
import { documentText } from '../lib/rich-text';

describe('read-only rich text', () => {
  it('preserves the starting number of an ordered list', () => {
    render(
      <RichText
        document={{
          type: 'doc',
          content: [
            {
              type: 'orderedList',
              attrs: { start: 5 },
              content: [
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'Fifth item' }],
                    },
                  ],
                },
              ],
            },
          ],
        }}
      />,
    );
    expect(screen.getByRole('list')).toHaveAttribute('start', '5');
    expect(screen.getByRole('listitem')).toHaveTextContent('Fifth item');
  });

  it('preserves hard breaks and nested list boundaries in optimistic and preview text', () => {
    expect(
      documentText({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'First line' },
              { type: 'hardBreak' },
              { type: 'text', text: 'Second line' },
            ],
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Parent' }],
                  },
                  {
                    type: 'orderedList',
                    content: [
                      {
                        type: 'listItem',
                        content: [
                          {
                            type: 'paragraph',
                            content: [{ type: 'text', text: 'Child' }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toBe('First line\nSecond line\nParent\nChild');
  });

  it('escapes text, ignores unsafe nodes, and rejects unsafe links', () => {
    const { container } = render(
      <RichText
        document={{
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: '<script>alert(1)</script>' },
                {
                  type: 'text',
                  text: 'Unsafe link',
                  marks: [
                    { type: 'link', attrs: { href: 'javascript:alert(1)' } },
                  ],
                },
                {
                  type: 'text',
                  text: 'Safe link',
                  marks: [
                    { type: 'link', attrs: { href: 'https://example.com' } },
                  ],
                },
              ],
            },
            { type: 'image', attrs: { src: 'x', onerror: 'alert(1)' } },
          ],
        }}
      />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/<script>alert/)).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Unsafe link' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Safe link' })).toHaveAttribute(
      'href',
      'https://example.com/',
    );
  });
});
