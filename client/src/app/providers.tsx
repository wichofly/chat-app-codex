import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPreviewService } from '../features/chats/preview';
import type {
  PreviewChatService,
  PreviewOutcome,
} from '../features/chats/preview-types';
import { api } from '../lib/api';
import { createThreadAuthClient } from '../lib/auth-client';
import type { ChatService, User } from '../lib/types';

type AppState = {
  user: User | null;
  sessionLoading: boolean;
  sessionError: boolean;
  retrySession: () => Promise<void>;
  preview: boolean;
  service: ChatService;
  previewService: PreviewChatService | null;
  previewOutcome: PreviewOutcome;
  setPreviewOutcome: (outcome: PreviewOutcome) => void;
  revision: number;
  refresh: () => void;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  startPreview: () => void;
  notify: (message: string, error?: boolean) => void;
};
const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [authClient] = useState(createThreadAuthClient);
  const session = authClient.useSession();
  const [revokedSessionId, setRevokedSessionId] = useState<string | null>(null);
  const [previewService, setPreviewService] =
    useState<PreviewChatService | null>(null);
  const [previewOutcome, setPreviewOutcome] =
    useState<PreviewOutcome>('normal');
  const preview = previewService !== null;
  const sessionRevoked =
    revokedSessionId !== null && session.data?.session.id === revokedSessionId;
  const user: User | null = preview
    ? { id: 'preview-user', name: 'Alex', email: 'alex@example.test' }
    : sessionRevoked
      ? null
      : (session.data?.user ?? null);
  const sessionLoading = !preview && session.isPending;
  const sessionError =
    !preview && !!session.error && session.error.status !== 401;
  const service = previewService ?? api;
  const [revision, setRevision] = useState(0);
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const recheck = () => {
      void session.refetch();
    };
    window.addEventListener('thread:session-expired', recheck);
    return () => window.removeEventListener('thread:session-expired', recheck);
  }, [session.refetch]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => () => previewService?.dispose(), [previewService]);
  const notify = useCallback((message: string, error = false) => {
    clearTimeout(timer.current);
    setToast({ message, error });
    timer.current = setTimeout(() => setToast(null), 6000);
  }, []);
  const refresh = useCallback(() => setRevision((r) => r + 1), []);
  const value: AppState = {
    user,
    sessionLoading,
    sessionError,
    retrySession: session.refetch,
    preview,
    service,
    previewService,
    previewOutcome,
    setPreviewOutcome,
    revision,
    refresh,
    notify,
    login: async (email, password) => {
      const result = await authClient.signIn.email({ email, password });
      if (result.error)
        throw new Error(
          result.error.message || 'Unable to sign in. Please try again.',
        );
      await session.refetch();
    },
    signup: async (name, email, password) => {
      const result = await authClient.signUp.email({ name, email, password });
      if (result.error)
        throw new Error(
          result.error.message ||
            'Unable to create your account. Please try again.',
        );
      await session.refetch();
    },
    signOut: async () => {
      if (!preview) {
        const result = await authClient.signOut();
        if (result.error)
          throw new Error(
            result.error.message || 'Unable to sign out. Please try again.',
          );
        // A failed background recheck must not restore a session the server just revoked.
        setRevokedSessionId(session.data?.session.id ?? null);
        await session.refetch();
      }
      previewService?.dispose();
      setPreviewService(null);
      setPreviewOutcome('normal');
      refresh();
    },
    startPreview: () => {
      previewService?.dispose();
      setPreviewService(createPreviewService());
      setPreviewOutcome('normal');
      refresh();
    },
  };
  return (
    <AppContext.Provider value={value}>
      {children}
      {toast && (
        <div
          className={`toast ${toast.error ? 'toast-error' : ''}`}
          role={toast.error ? 'alert' : 'status'}
        >
          {toast.error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{toast.message}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
