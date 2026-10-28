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
import { api, auth } from '../lib/api';
import type { ChatService, User } from '../lib/types';

type AppState = {
  user: User | null;
  sessionLoading: boolean;
  sessionError: boolean;
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
  const [user, setUser] = useState<User | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState(false);
  const [previewService, setPreviewService] =
    useState<PreviewChatService | null>(null);
  const [previewOutcome, setPreviewOutcome] =
    useState<PreviewOutcome>('normal');
  const preview = previewService !== null;
  const service = previewService ?? api;
  const [revision, setRevision] = useState(0);
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    let active = true;
    auth
      .session()
      .then((session) => {
        if (active) setUser(session?.user ?? null);
      })
      .catch(() => {
        if (active) setSessionError(true);
      })
      .finally(() => {
        if (active) setSessionLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
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
    preview,
    service,
    previewService,
    previewOutcome,
    setPreviewOutcome,
    revision,
    refresh,
    notify,
    login: async (email, password) => {
      const session = await auth.login(email, password);
      setUser(session.user);
      setSessionError(false);
    },
    signup: async (name, email, password) => {
      const session = await auth.signup(name, email, password);
      setUser(session.user);
      setSessionError(false);
    },
    signOut: async () => {
      if (!preview) await auth.logout();
      setUser(null);
      previewService?.dispose();
      setPreviewService(null);
      setPreviewOutcome('normal');
      refresh();
    },
    startPreview: () => {
      previewService?.dispose();
      setPreviewService(createPreviewService());
      setPreviewOutcome('normal');
      setSessionLoading(false);
      setUser({ id: 'preview-user', name: 'Alex', email: 'alex@example.test' });
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
