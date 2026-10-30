import { Trash2 } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useApp } from '../app/providers';
import type { ChatSummary } from '../lib/types';
import { Dialog } from './Dialog';

export function ChatActionsDialog({
  chat,
  action,
  onClose,
}: {
  chat: ChatSummary;
  action: 'rename' | 'delete';
  onClose: () => void;
}) {
  const { service, refresh, notify } = useApp();
  const { chatId } = useParams();
  const navigate = useNavigate();
  const [title, setTitle] = useState(chat.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const deleting = action === 'delete';
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (deleting) {
        await service.deleteChat(chat.id);
        if (chatId === chat.id) navigate('/chats');
      } else await service.renameChat(chat.id, title.trim());
      refresh();
      notify(deleting ? 'Conversation deleted.' : 'Conversation renamed.');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Please try again.');
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={deleting ? 'Delete this conversation?' : 'Rename conversation'}
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit}>
        {deleting ? (
          <>
            <div className="delete-icon">
              <Trash2 size={23} />
            </div>
            <p className="dialog-copy">
              “{chat.title}” and all its messages will be permanently deleted.
              Any public link will stop working.
            </p>
            <p className="dialog-note">This can’t be undone.</p>
          </>
        ) : (
          <div className="field">
            <label htmlFor="chat-title">Conversation name</label>
            <input
              id="chat-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              required
              autoFocus
              disabled={busy}
            />
            <span className="field-hint">
              {title.trim().length}/100 characters
            </span>
          </div>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className={`button ${deleting ? 'button-danger' : 'button-primary'}`}
            disabled={busy || (!deleting && !title.trim())}
          >
            {busy ? 'Working…' : deleting ? 'Delete conversation' : 'Save name'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
