import { ArrowRight, Eye, EyeOff, Info, Play } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useApp } from '../../app/providers';
import { Loading } from '../../components/States';
import { useDocumentTitle } from '../../lib/use-document-title';

export function AuthPage({ signup = false }: { signup?: boolean }) {
  useDocumentTitle(signup ? 'Create account' : 'Sign in');
  const app = useApp();
  const navigate = useNavigate();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (app.sessionLoading) return <Loading label="Checking your session…" />;
  if (app.user) return <Navigate to="/chats" replace />;
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const email = String(values.get('email')).trim();
      const password = String(values.get('password'));
      if (signup)
        await app.signup(String(values.get('name')).trim(), email, password);
      else await app.login(email, password);
      navigate('/chats', { replace: true });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to sign in. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-form-wrap" key={signup ? 'signup' : 'login'}>
      <span className="eyebrow">YOUR SPACE TO THINK</span>
      <h1>{signup ? 'A fresh start.' : 'Welcome back.'}</h1>
      <p className="auth-subtitle">
        {signup
          ? 'Make room for your next idea.'
          : 'Pick up a thought. Start something new.'}
      </p>
      <form onSubmit={submit} className="auth-form">
        {app.sessionError && (
          <div className="notice" role="status">
            <Info size={16} />
            <div>
              We couldn’t check your session. You can try signing in or check
              again.
              <br />
              <button
                type="button"
                className="text-button"
                onClick={() => void app.retrySession()}
              >
                Check session again
              </button>
            </div>
          </div>
        )}
        {signup && (
          <div className="field">
            <label htmlFor="name">Your name</label>
            <input
              id="name"
              name="name"
              autoComplete="name"
              placeholder="Alex Morgan"
              required
              maxLength={100}
              pattern=".*\S.*"
              disabled={busy}
            />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            disabled={busy}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <div className="password-input">
            <input
              id="password"
              name="password"
              type={passwordVisible ? 'text' : 'password'}
              autoComplete={signup ? 'new-password' : 'current-password'}
              placeholder={signup ? 'Create a password' : 'Enter your password'}
              minLength={signup ? 8 : undefined}
              maxLength={128}
              required
              disabled={busy}
              aria-describedby="password-note"
            />
            <button
              type="button"
              className="icon-button"
              aria-label={passwordVisible ? 'Hide password' : 'Show password'}
              onClick={() => setPasswordVisible((v) => !v)}
            >
              {passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {signup && (
            <span className="field-hint">Use at least 8 characters.</span>
          )}
        </div>
        <div className="notice" id="password-note">
          <Info size={16} />
          <p>
            This demo has no password recovery. Keep your password somewhere
            safe.
          </p>
        </div>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="button button-primary auth-submit"
          disabled={busy}
        >
          {busy ? (
            <>
              <span className="spinner" />
              {signup ? 'Creating your account…' : 'Signing in…'}
            </>
          ) : (
            <>
              {signup ? 'Create account' : 'Sign in'}
              <ArrowRight size={17} />
            </>
          )}
        </button>
      </form>
      <p className="auth-switch">
        {signup ? 'Already have an account?' : 'New around here?'}{' '}
        <Link to={signup ? '/login' : '/signup'}>
          {signup ? 'Sign in' : 'Create an account'}
          <ArrowUp />
        </Link>
      </p>
      <div className="preview-entry">
        <span className="divider-label">JUST LOOKING AROUND?</span>
        <button
          className="button button-secondary w-full"
          onClick={() => {
            app.startPreview();
            navigate('/chats');
          }}
        >
          <Play size={14} />
          Explore the UI preview
        </button>
        <p>Sample chats. No account needed. Changes reset on refresh.</p>
      </div>
    </div>
  );
}

function ArrowUp() {
  return <span aria-hidden="true"> ↗</span>;
}
