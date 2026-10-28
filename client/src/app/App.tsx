import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { RouteErrorReset } from '../components/RouteErrorBoundary';
import { Loading, NotFound } from '../components/States';
import { AuthLayout } from '../features/auth/AuthLayout';
import { AuthPage } from '../features/auth/AuthPage';
import { ChatLayout } from '../features/chats/ChatLayout';
import { AppProvider } from './providers';

const ChatPage = lazy(() =>
  import('../features/chats/ChatPage').then((module) => ({
    default: module.ChatPage,
  })),
);
const SharedPage = lazy(() =>
  import('../features/sharing/SharedPage').then((module) => ({
    default: module.SharedPage,
  })),
);

export function App() {
  return (
    <AppProvider>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <RouteErrorReset>
        <Suspense
          fallback={
            <main id="main-content">
              <Loading />
            </main>
          }
        >
          <Routes>
            <Route path="/" element={<Navigate to="/chats" replace />} />
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<AuthPage key="login" />} />
              <Route
                path="/signup"
                element={<AuthPage key="signup" signup />}
              />
            </Route>
            <Route path="/chats" element={<ChatLayout />}>
              <Route index element={<ChatPage />} />
              <Route path=":chatId" element={<ChatPage />} />
            </Route>
            <Route path="/shared/:token" element={<SharedPage />} />
            <Route
              path="*"
              element={
                <main id="main-content">
                  <NotFound />
                </main>
              }
            />
          </Routes>
        </Suspense>
      </RouteErrorReset>
    </AppProvider>
  );
}
