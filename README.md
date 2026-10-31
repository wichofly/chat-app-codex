# Thread · Chat App

React 19 + TypeScript chat UI with a separate Express 5 API, Better Auth email/password authentication, PostgreSQL/Prisma persistence, and streamed OpenRouter responses through AI SDK 7. Requirements are defined in [SPEC.md](SPEC.md); current priorities are in [ROADMAP.md](ROADMAP.md). Durable public sharing remains future work.

**Live demo:** [Open Thread](https://thread-chat-lovat.vercel.app). Create a new account; the separate hosted database does not contain local accounts. The free Render API may take about a minute to wake after inactivity, and the free database expires **November 30, 2026**. See the [release verification and hosting notes](docs/DEPLOYMENT.md).

## Run locally

For the hosted setup, follow [Deploy to Vercel and Render](docs/DEPLOYMENT.md). The repository includes `client/vercel.json`, a root `render.yaml`, and separate liveness/readiness endpoints. Replacement deployments need their own hosting access, domain settings and private production secrets.

Use Node **22** (22.12 or newer), npm, and PostgreSQL. Frontend builds target the Node 22 major. Create a dedicated empty `chat_app` database using your PostgreSQL installation before applying migrations.

```sh
npm install
```

Copy `server/.env.example` to `server/.env` (PowerShell: `Copy-Item server/.env.example server/.env`). Set `DATABASE_URL` to your database connection and replace `BETTER_AUTH_SECRET` with a random value of at least 32 characters. Generate a value locally with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep `.env` private. The default URLs are `http://localhost:3001` for the API and `http://localhost:5173` for the client. Use `localhost` consistently; changing the hostname or port also requires matching `CLIENT_ORIGIN`, `BETTER_AUTH_URL`, and any client API URL override.

Generate the client and apply the committed initial migration:

```sh
npm run db:generate
npm run db:migrate
```

Run these commands in separate terminals:

```sh
npm run dev:server
npm run dev
```

Open `http://localhost:5173/signup` to register with name, email, and password. Sign-in, refresh restoration, and sign-out use Better Auth and database sessions through HTTP-only cookies. Chat names survive refresh and sign-out; each account sees only its own chats. No email verification or password recovery is configured, so keep the demo password safe. This demo configuration is not intended for production users.

The UI can also run without the API: choose **Explore the UI preview** on the sign-in page after the session check completes. Preview changes live only in memory and reset on refresh. Neither mode stores passwords or conversation records in localStorage.

```sh
npm run build   # Client and server TypeScript checks and builds
npm run preview # Serve client/dist locally; use a /api reverse proxy or configure the API URL
npm test        # UI tests and server checks that do not require PostgreSQL
npm run typecheck --workspace server # Include server test code in the TypeScript check
```

For real database integration tests, set `TEST_DATABASE_URL` to a dedicated PostgreSQL test database, then run `npm run test:integration`. The suites migrate unique `thread_auth_test_...` and `thread_ai_test_...` schemas and drop only those schemas afterward. They test authentication/ownership, persisted messages, idempotent replay/retry, concurrent sends, abandoned pending recovery, daily budgets, HTTP disconnect cancellation and explicit Stop with mocked models. Never use a production database for tests. No lint command is currently configured. If client tests time out under parallel worker load, run `npm run test --workspace client -- --maxWorkers=1`.

## Connect OpenRouter

Set `OPENROUTER_API_KEY` in `server/.env` and restart the API after changing environment values. Keep the key server-only; never put it in client environment variables. The budget and timeout settings also belong in `server/.env`; `server/.env.example` is a template. Run `npm run db:generate` and `npm run db:migrate` after pulling schema changes, including the message-storage migration.

Sign in, write a prompt, and send. Sending from `/chats` creates a persisted conversation. The React client uses `useChat` and `DefaultChatTransport`, sending only `clientMessageId` and TipTap `contentJson`; the server loads the completed history. Replies stream progressively, store the selected model, and reload from safe TipTap JSON. Stop sends an authenticated cancellation request bound to the server-generated attempt ID, aborts upstream generation, and preserves partial text as failed before acknowledging cancellation. Private chat details restore the active attempt metadata so Stop also works after refresh or reopening the conversation. Retry reuses the original prompt and assistant row. Leaving a real conversation closes its browser request; hosting proxies may keep the server generating until completion or its bounded timeout, so use Stop first for explicit cancellation. The separate UI preview retains generation across chat navigation.

The three `OPENROUTER_MODEL_1/2/3` values define the server-side fallback order from SPEC.md. A model is tried once per request. Temporary errors, rate limits, unavailable models and first-token timeouts can fall back before text appears; credentials, invalid input and exhausted credit do not. Once response text reaches the client, failures remain visibly incomplete and never switch models mid-answer. Free-model availability and provider quotas can change independently of the app.

Defaults are 15 generation attempts per account per UTC day (including retries), 6,000 user characters, 20 completed history messages with a 24,000-character history bound, 1,024 output tokens, a 15-second first-token deadline per candidate and a 90-second total request deadline. See `server/.env.example` for configurable limits. Pending attempts abandoned after a crash become retryable after the total deadline plus a five-second grace period. An account's daily budget and each chat's generation guard are enforced in PostgreSQL, including across server processes.

Tests mock providers and never spend OpenRouter quota. For a bounded live smoke check, send one short non-private prompt and confirm a reply, its model label, and persistence after refresh. Do not repeatedly retry credential or quota failures.

## Pages

| Route            | Layout and content                                                            |
| ---------------- | ----------------------------------------------------------------------------- |
| `/login`         | Split auth layout, email/password form, preview entry                         |
| `/signup`        | Shared auth layout, name/email/password form, password recovery notice        |
| `/chats`         | Protected workspace, responsive sidebar, welcome, suggested prompts, composer |
| `/chats/:chatId` | Conversation history, title, rename/delete, sharing, rich-text composer       |
| `/shared/:token` | Public, read-only snapshot; no composer or private account metadata           |
| `*`              | Not Found                                                                     |

`/` redirects to `/chats`. Guests opening private routes redirect to `/login`. Express independently checks Better Auth sessions and ownership on chat endpoints; non-owned chats return a generic 404. Expired private API sessions trigger a client session recheck.

## What works now

- Responsive layouts with mobile navigation, focus management, skip link, native modal dialogs and reduced-motion support.
- TipTap JSON composer with bold, italic, lists, safe links and inline code. Enter submits; Shift+Enter inserts a newline. Empty and over-limit messages cannot be sent.
- Safe read-only JSON rendering, distinct user/assistant messages, loading skeletons, error and empty states, and notifications.
- Preview chat create/rename/delete, delete confirmation, snapshot creation, token rotation, copying and revocation.
- Interactive, explicitly labeled sample responses with progressive text, Stop, and safe Retry. Each chat tracks its own generation, which continues when you navigate to another page.
- Complete loading, empty, failure and recovery states; consistent page titles; a route error fallback with a reload action.
- Shared view adds `noindex, nofollow` metadata while mounted. Invalid or revoked tokens show the same unavailable page.
- API adapters for the spec’s session, auth, chat CRUD and sharing endpoints, using credentialed requests.
- Better Auth React client with email/password sign-up, sign-in, session refresh/restoration, and sign-out. Auth requests are mounted before Express body parsing; passwords are hashed by Better Auth and sessions are persisted in PostgreSQL.
- Real ownership-protected chat CRUD and message persistence, streaming responses, pre-content fallback, Stop, Retry, and per-account usage limits. Durable sharing operations still return a clear 503 after ownership checks.

**Real AI requires the server's OpenRouter key.** The separate UI preview continues to use fixed, clearly labeled sample responses without calling a model. Preview share links work only within the active preview tab; they are not public, durable links. Sign out/leave preview before trying real API authentication.

## Try the interactive preview

1. Choose **Explore the UI preview** on the sign-in page.
2. Pick a suggested prompt or write a formatted message, then send. Sending from the welcome page creates a new chat.
3. Use **Response** in the preview banner to select **Normal**, **Fail before response**, or **Fail during response**. The choice applies when a send or retry starts; changing it does not alter a response already in progress.
4. The fixed sample begins after 400 ms and reveals word groups every 250 ms. **Stop generation** keeps any partial text and displays “Generation stopped.” **Retry response** reuses the original prompt and assistant placeholder, using the currently selected outcome.
5. Switch chats during generation to see that only the generating chat blocks another send. Exit using **Close preview** or **Leave preview** to cancel pending timers and clear preview conversations and shares.

Shares contain only completed messages at the moment they are created. A pending, stopped, or failed assistant response is excluded; its completed user prompt may still be included. Later messages never update an existing snapshot. Refresh the snapshot explicitly to issue a replacement URL.

The preview subscription and generation interfaces are isolated from the production API contract. Automated tests cover progressive updates and failures with fake timers, navigation, cleanup, keyboard behavior, loading recovery, and read-only snapshots.

## Backend integration

The default API base is `/api`; Vite proxies it to `http://localhost:3001`. To use another origin, copy `client/.env.example` to `client/.env.local` and set `VITE_API_BASE_URL`. Never put server secrets in a `VITE_` variable.

`client/src/lib/api.ts` expects `{ data: ... }` for application responses and `{ error: { code, message } }` for errors. Better Auth’s standard session and email/password endpoint response shapes are also supported. Chat detail expects `{ id, title, createdAt, updatedAt, messages }`; sharing state expects `{ url: string | null, sharedAt?: string }`; public snapshots expect `{ title, messages, sharedAt }`. List expects a data array, with pagination deferred.

The API mounts Better Auth at `/api/auth/*splat`, uses its Prisma PostgreSQL adapter, and protects chat routes with `auth.api.getSession`. CORS and mutation origins are allowlisted; auth mutations are limited both by Better Auth and a per-IP Express limiter. Private responses use `Cache-Control: no-store`. Proxy trust is off by default; `TRUST_PROXY_HOPS` configures a bounded ingress hop count and the Render Blueprint uses 1. Cookie caching is disabled so database revocation takes effect on subsequent requests. `/api/health` checks process liveness; `/api/ready` checks database connectivity with a three-second deadline and a safe 503 on failure.

The React client uses the official Better Auth SDK in `client/src/lib/auth-client.ts`; authentication is not decoded through the generic application request helper. Cookie sessions also revalidate on focus and auth changes through the SDK. No secrets belong in client environment variables.

Hosted auth rate limits use a normalized visitor IP shared by Express and Better Auth. Vercel adds a private verification header using `TRUSTED_PROXY_SECRET`; Render uses the first address in Vercel's sanitized `X-Forwarded-For` chain only when that secret matches. Configure the same private random value on both hosts, never with a `VITE_` prefix. Direct API requests use the connection IP, and caller-supplied internal IP headers are overwritten. Streaming responses explicitly retain `Cache-Control: no-store`.

Still required for the full spec: durable sharing snapshots/tokens, public-share rate limits, and their integration tests. The preview generator is never a production data store.

Production SPA hosting must rewrite non-asset browser routes to `index.html`. The selected free Vercel/Render demo keeps `VITE_API_BASE_URL=/api` and proxies API requests through Vercel before the SPA fallback. Both server auth/origin URLs use the stable frontend origin. Render runs migrations at startup because free services have no pre-deploy command; the separate free PostgreSQL database expires after 30 days. Set a private random secret and `NODE_ENV=production`; HTTPS is required and auth cookies are Secure, HTTP-only, SameSite=Lax. For local `npm run preview` on another port, configure and rebuild with the direct API base URL and allow that exact preview origin on the server. Public share responses must retain `noindex, nofollow` and no-store when implemented.

## Auth schema maintenance

The `User`, `Session`, `Account`, and `Verification` Prisma models were generated with Better Auth CLI 1.7.14; application models include `Chat`, `Message`, and `GenerationUsage`. To inspect an updated auth schema, run `npm run auth:generate --workspace server`. It writes an ignored `prisma/auth.generated.prisma` file so it cannot overwrite application models. Review the generated auth changes, preserve application relations, generate/review a new Prisma migration, then apply migrations and regenerate the Prisma client. Do not run destructive schema resets against existing data.

Integration references consulted via Context7: [Better Auth Express integration](https://better-auth.com/docs/integrations/express), [Prisma adapter](https://better-auth.com/docs/adapters/prisma), and [React client](https://better-auth.com/docs/concepts/client).

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

`server/` contains `prisma/` for schema/migrations, `src/lib/` for Better Auth and Prisma setup, `src/middleware/` for sessions/errors, `src/modules/chats/` for chat routes/services, `src/modules/ai/` for validation, conversion, provider fallback and streaming persistence, and `src/tests/` for HTTP and PostgreSQL integration tests.
