import { ArrowUpRight, LockKeyhole, Sparkles } from 'lucide-react';
import { Outlet } from 'react-router';
import { Brand } from '../../components/Brand';

export function AuthLayout() {
  return (
    <div className="auth">
      <aside className="auth__story">
        <Brand to="/login" />
        <div className="auth__story-content">
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
            <div className="thought-illustration__orbit thought-illustration__orbit--inner" />
            <div className="thought-illustration__orbit thought-illustration__orbit--outer" />
            <div className="thought-note thought-note--one">
              <Sparkles size={18} />
              <span>What if we tried…</span>
            </div>
            <div className="thought-note thought-note--two">
              <span>A different perspective</span>
              <ArrowUpRight size={17} />
            </div>
            <div className="thought-illustration__center">
              t<span>✳</span>
            </div>
            <div className="thought-note thought-note--three">
              <span>A little more clarity.</span>
              <span className="small-dot" />
            </div>
          </div>
        </div>
        <div className="auth__story-footer">
          <LockKeyhole size={14} />
          <span>
            Your conversations stay yours. Share only when you choose.
          </span>
        </div>
      </aside>
      <main id="main-content" className="auth__main">
        <div className="auth__mobile-brand">
          <Brand to="/login" />
        </div>
        <Outlet />
        <footer className="auth__footer">
          A thoughtful space for curious minds.
        </footer>
      </main>
    </div>
  );
}
