import { Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useNavigate } from 'react-router';
import { useApp } from '../../app/providers';
import { ChatSidebar } from '../../components/ChatSidebar';
import { Loading } from '../../components/States';

export function ChatLayout() {
  const {
    user,
    sessionLoading,
    preview,
    previewOutcome,
    setPreviewOutcome,
    signOut,
  } = useApp();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 681px)');
    const closeOnDesktop = () => {
      if (desktop.matches) setMobileOpen(false);
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);
  useEffect(() => {
    if (!mobileOpen) return;
    const drawer = drawerRef.current;
    if (!drawer) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => [
      ...drawer.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      ),
    ];
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
      if (event.key === 'Tab') {
        const items = focusable(),
          first = items[0],
          last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
      toggleRef.current?.focus();
    };
  }, [mobileOpen]);
  if (sessionLoading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="chat-layout">
      {mobileOpen && (
        <button
          className="chat-layout__scrim"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div
        ref={drawerRef}
        className="chat-layout__sidebar"
        role={mobileOpen ? 'dialog' : undefined}
        aria-modal={mobileOpen || undefined}
        aria-label={mobileOpen ? 'Navigation' : undefined}
      >
        <ChatSidebar
          mobileOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
        />
      </div>
      <div className="workspace">
        {preview && (
          <div className="preview-banner">
            <span>
              <strong>UI preview</strong>
              <span className="preview-banner__detail">
                {' '}
                · Sample data, stored in memory. AI and accounts aren’t
                connected.
              </span>
            </span>
            <div className="preview-banner__controls">
              <label htmlFor="preview-response">Response</label>
              <select
                id="preview-response"
                value={previewOutcome}
                onChange={(event) => {
                  const outcome = event.currentTarget.value;
                  if (
                    outcome === 'normal' ||
                    outcome === 'fail-before' ||
                    outcome === 'fail-during'
                  )
                    setPreviewOutcome(outcome);
                }}
              >
                <option value="normal">Normal</option>
                <option value="fail-before">Fail before response</option>
                <option value="fail-during">Fail during response</option>
              </select>
              <button
                className="icon-button"
                aria-label="Close preview"
                onClick={async () => {
                  await signOut();
                  navigate('/login');
                }}
              >
                <X size={15} />
              </button>
            </div>
          </div>
        )}
        <button
          ref={toggleRef}
          className="icon-button workspace__menu-toggle"
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
          aria-controls="chat-sidebar"
          onClick={() => setMobileOpen(true)}
        >
          <Menu size={21} />
        </button>
        <main
          id="main-content"
          className="workspace__main"
          inert={mobileOpen || undefined}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
