import { ArrowUpRight, LockKeyhole, Sparkles } from 'lucide-react';
import { Outlet } from 'react-router';
import { Brand } from '../../components/Brand';

export function AuthLayout() {
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <Brand to="/login" />
        <div className="auth-story-content">
          <span className="eyebrow">
            <span className="small-dot" />A little space. A lot of possibility.
          </span>
          <h1>
            Good things start
            <br />
            with a thought<span>.</span>
          </h1>
          <p>
            A question, a rough idea, a blank page.
            <br />
            Bring it here. Let’s see where it goes.
          </p>
          <div className="thought-illustration" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="thought-note note-one">
              <Sparkles size={18} />
              <span>What if we tried…</span>
            </div>
            <div className="thought-note note-two">
              <span>A different perspective</span>
              <ArrowUpRight size={17} />
            </div>
            <div className="thought-center">
              t<span>✳</span>
            </div>
            <div className="thought-note note-three">
              <span>A little more clarity.</span>
              <span className="small-dot" />
            </div>
          </div>
        </div>
        <div className="auth-story-footer">
          <LockKeyhole size={14} />
          <span>
            Your conversations stay yours. Share only when you choose.
          </span>
        </div>
      </aside>
      <main id="main-content" className="auth-main">
        <div className="auth-mobile-brand">
          <Brand to="/login" />
        </div>
        <Outlet />
        <footer className="auth-footer">
          A thoughtful space for curious minds.
        </footer>
      </main>
    </div>
  );
}
