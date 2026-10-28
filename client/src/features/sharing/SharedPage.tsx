import { ArrowUpRight, LockKeyhole, Share2 } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { useApp } from '../../app/providers';
import { Brand } from '../../components/Brand';
import { MessageList } from '../../components/MessageList';
import {
  ConversationSkeleton,
  ErrorState,
  NotFound,
} from '../../components/States';
import { ApiError } from '../../lib/api';
import { useDocumentTitle } from '../../lib/use-document-title';
import { useResource } from '../../lib/use-resource';

export function SharedPage() {
  const { token = '' } = useParams();
  const { service, preview, refresh, revision } = useApp();
  const { data, loading, error } = useResource(
    () => service.getSnapshot(token),
    [service, token, revision],
  );
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);
  useDocumentTitle(
    error
      ? 'Shared conversation unavailable'
      : data?.title || 'Shared conversation',
  );
  return (
    <div className="shared-page">
      <header className="shared-header">
        <Brand to="/chats" />
        <Link to="/chats" className="button button-secondary">
          Your own space
          <ArrowUpRight size={15} />
        </Link>
      </header>
      <main id="main-content" className="shared-main">
        {loading ? (
          <ConversationSkeleton />
        ) : error ? (
          error instanceof ApiError && error.status === 404 ? (
            <NotFound shared nested />
          ) : (
            <ErrorState message={error.message} retry={refresh} />
          )
        ) : (
          data && (
            <>
              <div className="shared-title">
                <span className="eyebrow">
                  <Share2 size={13} />A SHARED PERSPECTIVE
                </span>
                <h1>{data.title}</h1>
                <div className="shared-meta">
                  <span>
                    <LockKeyhole size={13} />
                    Read-only snapshot
                  </span>
                  <span className="meta-dot">·</span>
                  <time dateTime={data.sharedAt}>
                    {new Intl.DateTimeFormat('en', {
                      dateStyle: 'medium',
                    }).format(new Date(data.sharedAt))}
                  </time>
                </div>
                <p>
                  {preview
                    ? 'UI preview · Sample conversation. This link isn’t published.'
                    : 'A moment from a conversation. New messages won’t appear here.'}
                </p>
              </div>
              {data.messages.length ? (
                <MessageList messages={data.messages} />
              ) : (
                <div className="page-state">
                  <p>This snapshot has no completed messages yet.</p>
                </div>
              )}
              <footer className="shared-footer">
                <span>A thought worth sharing.</span>
                <Link to="/chats">
                  Start your own conversation
                  <ArrowUpRight size={14} />
                </Link>
              </footer>
            </>
          )
        )}
      </main>
    </div>
  );
}
