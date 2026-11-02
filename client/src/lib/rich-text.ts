import type { RichDocument } from './types';

export function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function paragraph(text: string): RichDocument {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        ...(text ? { content: [{ type: 'text', text }] } : {}),
      },
    ],
  };
}

export function documentText(document: RichDocument): string {
  if (document.type === 'text') return document.text ?? '';
  if (document.type === 'hardBreak') return '\n';
  // Match the block separators used by the server's plain-text conversion.
  const separator = ['doc', 'bulletList', 'orderedList', 'listItem'].includes(
    document.type ?? '',
  )
    ? '\n'
    : '';
  return (document.content ?? []).map(documentText).join(separator);
}
