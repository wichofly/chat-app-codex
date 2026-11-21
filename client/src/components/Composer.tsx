import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  ArrowUp,
  Bold,
  Code2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Square,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { paragraph, safeUrl } from '../lib/rich-text';
import type { RichDocument } from '../lib/types';

export function Composer({
  onSend,
  prompt,
  disabled = false,
  generating = false,
  onStop,
}: {
  onSend: (content: RichDocument) => Promise<boolean>;
  prompt?: { text: string; key: number };
  disabled?: boolean;
  generating?: boolean;
  onStop?: () => void;
}) {
  const sendRef = useRef<() => void>(() => {});
  const [busy, setBusy] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [linkError, setLinkError] = useState('');
  const [sendError, setSendError] = useState('');
  const appliedPrompt = useRef<number | undefined>(undefined);
  const locked = disabled || generating || busy;
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        blockquote: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        link: {
          openOnClick: false,
          protocols: ['http', 'https'],
          isAllowedUri: (value) => !!safeUrl(value),
        },
      }),
      Placeholder.configure({
        placeholder: 'Ask a question, or follow a thought…',
      }),
    ],
    content: paragraph(''),
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': 'Message',
        'aria-multiline': 'true',
      },
      handleKeyDown: (view, event) => {
        if (
          event.key === 'Enter' &&
          !event.shiftKey &&
          !event.isComposing &&
          !view.composing
        ) {
          event.preventDefault();
          sendRef.current();
          return true;
        }
        return false;
      },
    },
  });
  const state = useEditorState({
    editor,
    selector: ({ editor }) =>
      !editor?.schema
        ? null
        : {
            length: editor.getText().trim().length,
            bold: editor.isActive('bold'),
            italic: editor.isActive('italic'),
            bullet: editor.isActive('bulletList'),
            ordered: editor.isActive('orderedList'),
            code: editor.isActive('code'),
            link: editor.isActive('link'),
          },
  });
  useEffect(() => {
    if (
      editor &&
      !editor.isDestroyed &&
      prompt &&
      !locked &&
      appliedPrompt.current !== prompt.key
    ) {
      appliedPrompt.current = prompt.key;
      editor.commands.setContent(paragraph(prompt.text));
      editor.commands.focus('end');
    }
  }, [editor, prompt, locked]);
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.setEditable(!locked);
    if (locked) setLinkOpen(false);
  }, [editor, locked]);
  const sending = useRef(false);
  async function send() {
    if (!editor || editor.isDestroyed || locked || sending.current) return;
    const text = editor.getText().trim();
    if (!text || text.length > 6000) return;
    sending.current = true;
    setSendError('');
    setBusy(true);
    editor.setEditable(false);
    try {
      if ((await onSend(editor.getJSON())) && !editor.isDestroyed)
        editor.commands.clearContent();
    } catch (error) {
      setSendError(
        error instanceof Error
          ? error.message
          : 'Could not send your message. Your draft is still here.',
      );
    } finally {
      sending.current = false;
      setBusy(false);
      if (!editor.isDestroyed) editor.commands.focus();
    }
  }
  sendRef.current = () => {
    void send();
  };
  const tools = [
    {
      label: 'Bold',
      Icon: Bold,
      active: state?.bold,
      run: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      label: 'Italic',
      Icon: Italic,
      active: state?.italic,
      run: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      label: 'Bullet list',
      Icon: List,
      active: state?.bullet,
      run: () => editor?.chain().focus().toggleBulletList().run(),
    },
    {
      label: 'Ordered list',
      Icon: ListOrdered,
      active: state?.ordered,
      run: () => editor?.chain().focus().toggleOrderedList().run(),
    },
    {
      label: 'Inline code',
      Icon: Code2,
      active: state?.code,
      run: () => editor?.chain().focus().toggleCode().run(),
    },
  ];
  return (
    <div className="composer">
      <div
        className={`composer__surface ${locked ? 'composer__surface--busy' : ''}`}
        aria-busy={generating}
      >
        <EditorContent editor={editor} />
        {linkOpen && !locked && (
          <form
            className="composer__link-editor"
            onSubmit={(event) => {
              event.preventDefault();
              const href = safeUrl(url);
              if (!href) {
                setLinkError('Enter a full http:// or https:// URL.');
                return;
              }
              editor
                ?.chain()
                .focus()
                .extendMarkRange('link')
                .setLink({ href })
                .run();
              setLinkOpen(false);
              setLinkError('');
            }}
          >
            <label className="sr-only" htmlFor="composer-link">
              Link URL
            </label>
            <input
              id="composer-link"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com"
              autoFocus
            />
            <button className="text-button" type="submit">
              Apply
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                editor?.chain().focus().unsetLink().run();
                setLinkOpen(false);
              }}
            >
              Remove
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Close link editor"
              onClick={() => setLinkOpen(false)}
            >
              <X size={15} />
            </button>
            {linkError && (
              <span className="inline-error" role="alert">
                {linkError}
              </span>
            )}
          </form>
        )}
        <div className="composer__bottom">
          <div
            className="composer__toolbar"
            role="group"
            aria-label="Text formatting"
          >
            {tools.map(({ label, Icon, active, run }) => (
              <button
                key={label}
                className={`icon-button ${active ? 'icon-button--active' : ''}`}
                aria-label={label}
                aria-pressed={active}
                title={label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={run}
                disabled={locked}
              >
                <Icon size={16} />
              </button>
            ))}
            <span className="composer__divider" />
            <button
              className={`icon-button ${state?.link ? 'icon-button--active' : ''}`}
              aria-label="Add or edit link"
              aria-expanded={linkOpen}
              onClick={() => {
                setUrl(editor?.getAttributes('link').href || '');
                setLinkError('');
                setLinkOpen((v) => !v);
              }}
              disabled={locked}
            >
              <Link2 size={16} />
            </button>
          </div>
          <div className="composer__send">
            <span className="composer__shortcut">
              Shift + Enter for a new line
            </span>
            {generating && onStop ? (
              <button
                className="button button--secondary composer__stop-button"
                onClick={onStop}
              >
                <Square size={12} fill="currentColor" />
                Stop generation
              </button>
            ) : (
              <button
                className="composer__send-button"
                aria-label="Send message"
                title="Send message (Enter)"
                onClick={() => void send()}
                disabled={!state?.length || state.length > 6000 || locked}
              >
                {busy ? <span className="spinner" /> : <ArrowUp size={19} />}
              </button>
            )}
          </div>
        </div>
      </div>
      {sendError && (
        <p className="inline-error" role="alert">
          {sendError}
        </p>
      )}
      {!!state && state.length > 6000 && (
        <p className="inline-error" role="alert">
          Please keep your message under 6,000 characters (
          {state.length.toLocaleString()}/6,000).
        </p>
      )}
      <p className="composer__disclaimer">
        A little perspective, powered by AI. Always double-check what matters.
      </p>
    </div>
  );
}
