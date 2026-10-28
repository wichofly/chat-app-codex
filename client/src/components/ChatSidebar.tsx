import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import {
  ArrowUpRight,
  BookOpen,
  LogOut,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../app/providers';
import { useResource } from '../lib/use-resource';
import type { ChatSummary } from '../lib/types';
import { Brand } from './Brand';
import { ChatActionsDialog } from './ChatActionsDialog';
import { usePreviewChatList } from '../features/chats/use-preview';

export function ChatSidebar({
  mobileOpen,
  onClose,
}: {
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const { user, service, preview, revision, refresh, notify, signOut } =
    useApp();
  const navigate = useNavigate();
  const {
    data: remoteChats,
    loading: remoteLoading,
    error: remoteError,
  } = useResource(() => preview ? Promise.resolve(null) : service.listChats(), [service, revision]);
  const previewChats = usePreviewChatList();
  const chats = preview ? previewChats : remoteChats;
  const loading = !preview && remoteLoading;
  const error = !preview && remoteError;
  const [action, setAction] = useState<{
    chat: ChatSummary;
    type: 'rename' | 'delete';
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const [leaving, setLeaving] = useState(false);
  async function create() {
    setCreating(true);
    try {
      const chat = await service.createChat();
      refresh();
      navigate(`/chats/${chat.id}`);
      onClose();
    } catch (err) {
      notify(
        err instanceof Error ? err.message : 'Could not create conversation.',
        true,
      );
    } finally {
      setCreating(false);
    }
  }
  const today = new Date().toDateString();
  const groups = [
    {
      label: 'Today',
      chats:
        chats?.filter((c) => new Date(c.updatedAt).toDateString() === today) ??
        [],
    },
    {
      label: 'Earlier',
      chats:
        chats?.filter((c) => new Date(c.updatedAt).toDateString() !== today) ??
        [],
    },
  ];
  return (
    <>
      <aside
        id="chat-sidebar"
        className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}
        aria-label="Your conversations"
      >
        <div className="sidebar-top">
          <Brand to="/chats" />
          <button
            className="icon-button sidebar-close"
            aria-label="Close navigation"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <button
          className="button new-chat-button"
          onClick={create}
          disabled={creating}
        >
          <Plus size={18} />
          {creating ? 'Creating…' : 'New chat'}
          <span className="new-chat-symbol" aria-hidden="true">
            ↗
          </span>
        </button>
        <div className="sidebar-section-title">
          YOUR CONVERSATIONS<span>{chats?.length ?? '—'}</span>
        </div>
        <nav className="chat-nav" aria-label="Chat history">
          {loading && (
            <div
              className="sidebar-skeleton"
              role="status"
              aria-label="Loading conversations"
            >
              {[1, 2, 3].map((i) => (
                <div className="skeleton h-9 w-full" key={i} />
              ))}
            </div>
          )}
          {error && (
            <div className="sidebar-empty">
              <p role="alert">Couldn’t load your chats.</p>
              <button className="text-button" onClick={refresh}>
                Try again
              </button>
            </div>
          )}
          {chats?.length === 0 && (
            <div className="sidebar-empty">
              <MessageSquare size={23} />
              <p>A clean slate.</p>
              <span>Your conversations will appear here.</span>
            </div>
          )}
          {groups
            .filter((g) => g.chats.length)
            .map((group) => (
              <div className="chat-group" key={group.label}>
                <p className="chat-group-label">{group.label}</p>
                {group.chats.map((chat) => (
                  <div className="chat-row" key={chat.id}>
                    <NavLink
                      to={`/chats/${chat.id}`}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `chat-link ${isActive ? 'chat-link-active' : ''}`
                      }
                    >
                      <MessageSquare size={15} />
                      <span title={chat.title}>{chat.title}</span>
                    </NavLink>
                    <div className="chat-row-actions">
                      <button
                        className="icon-button"
                        aria-label={`Rename ${chat.title}`}
                        title="Rename"
                        onClick={() => setAction({ chat, type: 'rename' })}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Delete ${chat.title}`}
                        title="Delete"
                        onClick={() => setAction({ chat, type: 'delete' })}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
        </nav>
        <div className="sidebar-bottom">
          {preview && (
            <Link
              to="/shared/demo"
              className="sidebar-preview-link"
              onClick={onClose}
            >
              <BookOpen size={15} />
              View a shared conversation
              <ArrowUpRight size={14} />
            </Link>
          )}
          <div className="sidebar-privacy">
            <span className="small-dot" />A private space for your thoughts.
          </div>
          <div className="user-menu">
            <span className="avatar">
              {user?.name.charAt(0).toUpperCase() || 'Y'}
            </span>
            <div>
              <strong>{user?.name}</strong>
              <span>{preview ? 'UI preview' : 'Personal account'}</span>
            </div>
            <button
              className="icon-button"
              aria-label={preview ? 'Leave preview' : 'Sign out'}
              title={preview ? 'Leave preview' : 'Sign out'}
              disabled={leaving}
              onClick={async () => {
                setLeaving(true);
                try {
                  await signOut();
                  navigate('/login');
                } catch {
                  notify('Could not sign out. Try again.', true);
                } finally {
                  setLeaving(false);
                }
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {action && (
        <ChatActionsDialog
          chat={action.chat}
          action={action.type}
          onClose={() => setAction(null)}
        />
      )}
    </>
  );
}
