import { AlertCircle, ArrowLeft, RefreshCw, SearchX } from 'lucide-react';
import { Link } from 'react-router';
import { useDocumentTitle } from '../lib/use-document-title';

export function Loading({ label = 'Loading your space…' }: { label?: string }) {
  return (
    <div className="page-state" role="status">
      <span className="spinner" />
      <p>{label}</p>
    </div>
  );
}

export function ConversationSkeleton() {
  return (
    <div
      className="conversation-skeleton"
      role="status"
      aria-label="Loading conversation"
    >
      <div className="skeleton h-5 w-2/5 ml-auto" />
      <div className="skeleton h-4 w-3/4" />
      <div className="skeleton h-4 w-full" />
      <div className="skeleton h-4 w-4/5" />
      <div className="skeleton h-4 w-2/3" />
    </div>
  );
}

export function ErrorState({
  message,
  retry,
  retryLabel = 'Try again',
}: {
  message: string;
  retry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="page-state">
      <span className="state-icon">
        <AlertCircle size={26} />
      </span>
      <h2>Let’s try that again</h2>
      <p role="alert">{message}</p>
      {retry && (
        <button className="button button-secondary" onClick={retry}>
          <RefreshCw size={16} />
          {retryLabel}
        </button>
      )}
    </div>
  );
}

export function NotFound({
  shared = false,
  nested = false,
}: {
  shared?: boolean;
  nested?: boolean;
}) {
  useDocumentTitle(
    shared ? 'Shared conversation unavailable' : 'Page not found',
  );
  return (
    <div className={`page-state ${nested ? '' : 'full-page-state'}`}>
      <span className="state-icon">
        <SearchX size={28} />
      </span>
      <span className="eyebrow">404 · A loose thread</span>
      <h1>
        {shared
          ? 'This conversation isn’t available'
          : 'Nothing to see here, just yet'}
      </h1>
      <p>
        {shared
          ? 'This link may have been disabled, replaced, or never existed.'
          : 'The page you’re looking for may have moved, or the link might be incomplete.'}
      </p>
      <Link className="button button-primary" to="/chats">
        <ArrowLeft size={16} />
        Back to your space
      </Link>
    </div>
  );
}
