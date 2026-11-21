import { Link } from 'react-router';

export function ThreadMark({ small = false }: { small?: boolean }) {
  return (
    <span
      className={`thread-mark ${small ? 'thread-mark--small' : ''}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" fill="none">
        <path
          d="M8 9h16M16 9v16M9 17h14"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export function Brand({ to = '/' }: { to?: string }) {
  return (
    <Link className="brand" to={to} aria-label="Thread home">
      <ThreadMark small />
      <span>
        thread<span className="brand__dot">.</span>
      </span>
    </Link>
  );
}
