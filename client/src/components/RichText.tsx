import { Fragment, type ReactNode } from 'react';
import { safeUrl } from '../lib/rich-text';
import type { RichDocument } from '../lib/types';

function renderNode(node: RichDocument, key: string): ReactNode {
  const children = node.content?.map((child, index) =>
    renderNode(child, `${key}-${index}`),
  );
  if (node.type === 'text') {
    let text: ReactNode = node.text || '';
    for (const mark of node.marks || []) {
      if (mark.type === 'bold') text = <strong>{text}</strong>;
      if (mark.type === 'italic') text = <em>{text}</em>;
      if (mark.type === 'code') text = <code>{text}</code>;
      if (mark.type === 'link') {
        const href = safeUrl(mark.attrs?.href);
        if (href)
          text = (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {text}
            </a>
          );
      }
    }
    return <Fragment key={key}>{text}</Fragment>;
  }
  switch (node.type) {
    case 'doc':
      return <Fragment key={key}>{children}</Fragment>;
    case 'paragraph':
      return <p key={key}>{children}</p>;
    case 'heading':
      return node.attrs?.level === 2 ? (
        <h2 key={key}>{children}</h2>
      ) : (
        <h3 key={key}>{children}</h3>
      );
    case 'bulletList':
      return <ul key={key}>{children}</ul>;
    case 'orderedList':
      return <ol key={key}>{children}</ol>;
    case 'listItem':
      return <li key={key}>{children}</li>;
    case 'codeBlock':
      return (
        <pre key={key}>
          <code>{children}</code>
        </pre>
      );
    case 'hardBreak':
      return <br key={key} />;
    default:
      return null;
  }
}

export function RichText({ document }: { document: RichDocument | null }) {
  return (
    <div className="rich-text">
      {document ? renderNode(document, 'root') : null}
    </div>
  );
}
