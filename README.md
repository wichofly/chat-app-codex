# Thread · Chat app UI foundation

The base React 19 + TypeScript pages and layouts from [SPEC.md](SPEC.md). This delivery is the **frontend foundation**, not the complete MVP backend.

## Run locally

Requires Node **22.12+** and npm.

```sh
npm install
npm run dev
```

Open the Local URL printed by Vite. From the sign-in page, choose **Explore the UI preview** to try the interface with sample data. Preview changes live only in memory and reset when you refresh. Passwords and conversations are never saved in localStorage.

```sh
npm run build   # TypeScript check and production build
npm run preview # Serve client/dist locally after building
npm test        # UI, access-state, safe-rendering and snapshot tests
```

## Pages

| Route            | Layout and content                                                            |
| ---------------- | ----------------------------------------------------------------------------- |
| `/login`         | Split auth layout, email/password form, preview entry                         |
| `/signup`        | Shared auth layout, name/email/password form, password recovery notice        |
| `/chats`         | Protected workspace, responsive sidebar, welcome, suggested prompts, composer |
| `/chats/:chatId` | Conversation history, title, rename/delete, sharing, rich-text composer       |
| `/shared/:token` | Public, read-only snapshot; no composer or private account metadata           |
| `*`              | Not Found                                                                     |

`/` redirects to `/chats`. Guests opening private routes redirect to `/login`. These frontend guards are navigation behavior; the future server must enforce session checks and ownership independently.

## What works now

- Responsive layouts with mobile navigation, focus management, skip link, native modal dialogs and reduced-motion support.
- TipTap JSON composer with bold, italic, lists, safe links and inline code. Enter submits; Shift+Enter inserts a newline. Empty and over-limit messages cannot be sent.
- Safe read-only JSON rendering, distinct user/assistant messages, loading skeletons, error and empty states, and notifications.
- Preview chat create/rename/delete, delete confirmation, snapshot creation, token rotation, copying and revocation.
- Shared view adds `noindex, nofollow` metadata while mounted. Invalid or revoked tokens show the same unavailable page.
- API adapters for the spec’s session, auth, chat CRUD and sharing endpoints, using credentialed requests.

**Sending and streaming are intentionally not implemented.** Sending a draft shows an explanatory state and retains the draft. There are no fabricated AI responses. Preview share links work only within the active preview tab; they are not public, durable links. Sign out/leave preview before trying real API authentication.

## Backend integration

The default API base is `/api`; Vite proxies it to `http://localhost:3001`. To use another origin, copy `client/.env.example` to `client/.env.local` and set `VITE_API_BASE_URL`. Never put server secrets in a `VITE_` variable.

`client/src/lib/api.ts` expects `{ data: ... }` for application responses and `{ error: { code, message } }` for errors. Better Auth’s standard session and email/password endpoint response shapes are also supported. Chat detail expects `{ id, title, createdAt, updatedAt, messages }`; sharing state expects `{ url: string | null, sharedAt?: string }`; public snapshots expect `{ title, messages, sharedAt }`. List expects a data array, with pagination deferred.

Still required for the full spec: Express server, PostgreSQL/Prisma, Better Auth configuration, migrations, server validation/ownership, durable share snapshots and secure tokens, AI SDK `useChat` transport and OpenRouter streaming/fallback/stop/retry, server rate limits, and backend integration tests. The demo generator is isolated in `features/chats/preview.ts` and is never used as a production data store.

Production SPA hosting must rewrite non-asset browser routes to `index.html`; route API requests to the separate server. Configure credentialed CORS and trusted origins if hosting the API on another origin. Set `Cache-Control: no-store` on private API responses and public snapshots, and `X-Robots-Tag: noindex, nofollow` on public share responses at the server/host.

## Structure

```text
client/src/
  app/              Routes and session/preview/notification provider
  components/       Sidebar, composer, messages, dialogs and states
  features/auth/    Auth layout and forms
  features/chats/   Workspace, conversation page and preview fixtures
  features/sharing/ Share dialog and public page
  lib/              API adapter, resource loading and contract types
  styles/           Tailwind import, tokens and responsive styles
  test/             Focused foundation tests
```

No server scaffold or database schema is included in this page/layout task. Follow the spec’s delivery phases for that implementation; generate Better Auth’s database models with its CLI.
