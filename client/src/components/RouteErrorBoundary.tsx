import { Component, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { useDocumentTitle } from '../lib/use-document-title';
import { ErrorState } from './States';

function RouteFailure() {
  useDocumentTitle('Page unavailable');
  return (
    <main id="main-content" className="route-failure">
      <ErrorState
        message="This page couldn’t load. Reload the page to try again."
        retry={() => window.location.reload()}
        retryLabel="Reload page"
      />
    </main>
  );
}

export class RouteErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <RouteFailure /> : this.props.children;
  }
}

export function RouteErrorReset({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <RouteErrorBoundary key={location.pathname}>{children}</RouteErrorBoundary>
  );
}
