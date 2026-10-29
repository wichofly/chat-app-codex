import { marked, type Token, type Tokens } from 'marked';
import { z } from 'zod';

export type RichNode = {
  type: string;
  text?: string;
  attrs?: {
    level?: number;
    start?: number;
    language?: string | null;
    href?: string;
    target?: string | null;
    rel?: string | null;
    class?: string | null;
  };
  content?: RichNode[];
  marks?: {
    type: string;
    attrs?: {
      href?: string;
      target?: string | null;
      rel?: string | null;
      class?: string | null;
    };
  }[];
};
const url = z
  .string()
  .url()
  .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol));
const linkAttrs = z
  .object({
    href: url,
    target: z.string().nullable().optional(),
    rel: z.string().nullable().optional(),
    class: z.string().nullable().optional(),
  })
  .strict();
const mark = z.union([
  z.object({ type: z.enum(['bold', 'italic', 'code']) }).strict(),
  z.object({ type: z.literal('link'), attrs: linkAttrs }).strict(),
]);
const node: z.ZodType<RichNode> = z.lazy(() =>
  z.union([
    z
      .object({ type: z.literal('doc'), content: z.array(node).min(1) })
      .strict(),
    z
      .object({
        type: z.literal('text'),
        text: z.string().min(1),
        marks: z.array(mark).max(4).optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal('paragraph'),
        content: z.array(node).optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal('heading'),
        attrs: z
          .object({ level: z.union([z.literal(2), z.literal(3)]) })
          .strict(),
        content: z.array(node).optional(),
      })
      .strict(),
    z
      .object({ type: z.literal('bulletList'), content: z.array(node).min(1) })
      .strict(),
    z
      .object({
        type: z.literal('orderedList'),
        attrs: z
          .object({ start: z.number().int().min(1) })
          .strict()
          .optional(),
        content: z.array(node).min(1),
      })
      .strict(),
    z
      .object({ type: z.literal('listItem'), content: z.array(node).min(1) })
      .strict(),
    z
      .object({
        type: z.literal('codeBlock'),
        attrs: z
          .object({ language: z.string().max(60).nullable().optional() })
          .strict()
          .optional(),
        content: z.array(node).optional(),
      })
      .strict(),
    z.object({ type: z.literal('hardBreak') }).strict(),
  ]),
);

export function plainText(document: RichNode): string {
  if (document.type === 'text') return document.text ?? '';
  if (document.type === 'hardBreak') return '\n';
  const separator = ['doc', 'bulletList', 'orderedList', 'listItem'].includes(
    document.type,
  )
    ? '\n'
    : '';
  return (document.content ?? []).map(plainText).join(separator);
}
export function paragraph(text: string): RichNode {
  return {
    type: 'doc',
    content: text.split('\n\n').map((value) => ({
      type: 'paragraph',
      ...(value ? { content: [{ type: 'text', text: value }] } : {}),
    })),
  };
}
export function documentSchema(maxChars: number) {
  return z.unknown().transform((value, context) => {
    // Bound recursion before entering the recursive Zod schema.
    let count = 0;
    function bounded(item: unknown, depth: number): boolean {
      if (depth > 30 || ++count > 2000) return false;
      if (!item || typeof item !== 'object') return true;
      return Object.values(item).every((child) => bounded(child, depth + 1));
    }
    if (!bounded(value, 0)) {
      context.addIssue({ code: 'custom', message: 'Document is too complex.' });
      return z.NEVER;
    }
    const result = node.safeParse(value);
    if (!result.success || result.data.type !== 'doc') {
      context.addIssue({
        code: 'custom',
        message: 'Invalid rich-text document.',
      });
      return z.NEVER;
    }
    function valid(current: RichNode): boolean {
      const children = current.content ?? [];
      const inline = ['text', 'hardBreak'];
      const blocks = [
        'paragraph',
        'heading',
        'bulletList',
        'orderedList',
        'codeBlock',
      ];
      const allowed =
        current.type === 'doc'
          ? blocks
          : ['paragraph', 'heading'].includes(current.type)
            ? inline
            : current.type === 'codeBlock'
              ? ['text']
              : ['bulletList', 'orderedList'].includes(current.type)
                ? ['listItem']
                : current.type === 'listItem'
                  ? ['paragraph', 'bulletList', 'orderedList']
                  : [];
      return (
        (current.type !== 'listItem' || children[0]?.type === 'paragraph') &&
        children.every((child) => allowed.includes(child.type) && valid(child))
      );
    }
    const text = plainText(result.data).trim();
    if (!valid(result.data) || !text || text.length > maxChars) {
      context.addIssue({
        code: 'custom',
        message: `Use a valid message of 1–${maxChars} characters.`,
      });
      return z.NEVER;
    }
    return result.data;
  });
}

function inline(tokens: Token[] = []): RichNode[] {
  return tokens.flatMap((token): RichNode[] => {
    switch (token.type) {
      case 'strong':
      case 'em':
      case 'link': {
        const nodes = inline(token.tokens);
        if (token.type === 'link' && !url.safeParse(token.href).success)
          return nodes;
        const mark =
          token.type === 'link'
            ? { type: 'link', attrs: { href: token.href } }
            : { type: token.type === 'strong' ? 'bold' : 'italic' };
        return nodes.map((child) =>
          child.type === 'text'
            ? { ...child, marks: [...(child.marks ?? []), mark] }
            : child,
        );
      }
      case 'codespan':
        return [{ type: 'text', text: token.text, marks: [{ type: 'code' }] }];
      case 'br':
        return [{ type: 'hardBreak' }];
      case 'text':
        return token.tokens
          ? inline(token.tokens)
          : token.text
            ? [{ type: 'text', text: token.text }]
            : [];
      case 'escape':
        return [{ type: 'text', text: token.text }];
      case 'html':
        return [{ type: 'text', text: token.raw }];
      default:
        return token.raw ? [{ type: 'text', text: token.raw }] : [];
    }
  });
}
function blocks(tokens: Token[]): RichNode[] {
  return tokens.flatMap((token): RichNode[] => {
    switch (token.type) {
      case 'space':
        return [];
      case 'heading':
        return [
          {
            type: 'heading',
            attrs: { level: token.depth <= 2 ? 2 : 3 },
            content: inline(token.tokens),
          },
        ];
      case 'paragraph':
        return [{ type: 'paragraph', content: inline(token.tokens) }];
      case 'text':
        return [
          {
            type: 'paragraph',
            content: token.tokens
              ? inline(token.tokens)
              : [{ type: 'text', text: token.text }],
          },
        ];
      case 'code':
        return [
          {
            type: 'codeBlock',
            content: token.text ? [{ type: 'text', text: token.text }] : [],
          },
        ];
      case 'list':
        return [
          {
            type: token.ordered ? 'orderedList' : 'bulletList',
            content: token.items.map((item: Tokens.ListItem) => ({
              type: 'listItem',
              content: blocks(item.tokens),
            })),
          },
        ];
      case 'blockquote':
        return blocks(token.tokens ?? []);
      default:
        return [
          {
            type: 'paragraph',
            content: token.raw ? [{ type: 'text', text: token.raw }] : [],
          },
        ];
    }
  });
}
export function assistantDocument(text: string): RichNode {
  try {
    const document = { type: 'doc', content: blocks(marked.lexer(text)) };
    return documentSchema(64000).parse(document);
  } catch {
    return paragraph(text);
  }
}
