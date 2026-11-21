# Thread · Chat App

React 19 + TypeScript chat UI with a separate Express 5 API, Better Auth email/password authentication, PostgreSQL/Prisma persistence, durable public snapshots, and streamed OpenRouter responses through AI SDK 7. Requirements are defined in [SPEC.md](SPEC.md); current priorities are in [ROADMAP.md](ROADMAP.md).

**Live demo:** [Open Thread](https://thread-chat-lovat.vercel.app). Production data is stored in Neon, separately from local accounts and conversations. The free Render API may take about a minute to wake after inactivity. See the [release verification and hosting notes](docs/DEPLOYMENT.md).

## Run locally

For the hosted setup, follow [Deploy with Vercel, Render and Neon](docs/DEPLOYMENT.md). The repository includes `client/vercel.json`, an API-only `render.yaml`, and separate liveness/readiness endpoints. Render connects to the Neon `thread_production` database through its private `DATABASE_URL` setting. Replacement deployments need their own hosting access, domain settings and private production secrets.

Use Node **22** (22.12 or newer), npm, and PostgreSQL. Frontend builds target the Node 22 major. Create a dedicated empty `chat_app` database using your PostgreSQL installation before applying migrations.

```sh
npm install
```

Copy `server/.env.example` to `server/.env` (PowerShell: `Copy-Item server/.env.example server/.env`). Set `DATABASE_URL` to your database connection and replace `BETTER_AUTH_SECRET` with a random value of at least 32 characters. Generate a value locally with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep `.env` private. The default URLs are `http://localhost:3001` for the API and `http://localhost:5173` for the client. Use `localhost` consistently. A different frontend port needs a matching `CLIENT_ORIGIN`; a different API port needs a matching `BETTER_AUTH_URL` and Vite proxy target.

Keep local and hosted settings separate: local `server/.env` needs `BETTER_AUTH_URL="http://localhost:3001"` and `CLIENT_ORIGIN="http://localhost:5173"`. The deployed API uses the canonical Vercel URL for both settings and `NODE_ENV=production`. Leave `VITE_API_BASE_URL` unset or set it to `/api`: Vite proxies requests to the local API, while Vercel proxies them to the Render Node service. Configure the Neon production `DATABASE_URL` privately on Render; the frontend never connects directly to PostgreSQL. Local development keeps its own database, and `server/.env.production.local` is not loaded automatically. `server/auth.config.ts` is only for schema generation; runtime authentication uses `server/src/lib/auth.ts` and the validated server environment. Restart the local API after changing `.env`.

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

Both processes must stay running. If Vite opens but `/api` requests return 502, check that Express is running on port 3001. Open `http://localhost:5173/api/health` and `/api/ready`; both should return 200. Readiness checks the local API's database connection. Vite uses a strict port and exits if 5173 is occupied; reuse your existing dev server or stop it before starting another. To intentionally use 5174, set `CLIENT_ORIGIN="http://localhost:5174"` in `server/.env`, restart Express, and run `npm run dev --workspace client -- --port 5174`. Keep `BETTER_AUTH_URL="http://localhost:3001"` when only the frontend port changes.

Open `http://localhost:5173/signup` to register with name, email, and password. Sign-in, refresh restoration, and sign-out use Better Auth and database sessions through HTTP-only cookies. Chat names survive refresh and sign-out; each account sees only its own chats. No email verification or password recovery is configured, so keep the demo password safe. This demo configuration is not intended for production users.

The UI can also run without the API: choose **Explore the UI preview** on the sign-in page after the session check completes. Preview changes live only in memory and reset on refresh. Neither mode stores passwords or conversation records in localStorage.

```sh
npm run build   # Client and server TypeScript checks and builds
npm run preview # Serve client/dist locally; use a /api reverse proxy or configure the API URL
npm test        # UI tests and server checks that do not require PostgreSQL
npm run typecheck --workspace server # Include server test code in the TypeScript check
```

For real database integration tests, set `TEST_DATABASE_URL` to a dedicated PostgreSQL test database, then run `npm run test:integration`. The suites migrate unique `thread_auth_test_...` and `thread_ai_test_...` schemas and drop only those schemas afterward. They test authentication/ownership, persisted messages, idempotent replay/retry, concurrent sends, abandoned pending recovery, daily budgets, HTTP disconnect cancellation, explicit Stop with mocked models, public snapshot lifecycle and chat pagination. Never use a production database for tests. No lint command is currently configured. Client tests use one worker by default to avoid timeouts under parallel jsdom load.

## Connect OpenRouter

In real chats, choose **Answer style** above the composer: **Thread** for direct help and follow-up questions, **ELI5** for simple explanations, or **Coach** for practical action plans. The choice applies to the next send or retry and resets to Thread on page refresh; it is not saved with the conversation. System prompts stay in `server/src/modules/ai/provider.ts`. The UI preview keeps its fixed sample responses.

Set `OPENROUTER_API_KEY` in `server/.env` and restart the API after changing environment values. Keep the key server-only; never put it in client environment variables. The budget and timeout settings also belong in `server/.env`; `server/.env.example` is a template. Run `npm run db:generate` and `npm run db:migrate` after pulling schema changes, including the message-storage migration.

Sign in, write a prompt, and send. Sending from `/chats` creates a persisted conversation. The React client uses `useChat` and `DefaultChatTransport`, sending only `clientMessageId`, TipTap `contentJson`, and the selected `persona`; the server loads the completed history. Replies stream progressively, store the selected model, and reload from safe TipTap JSON. Stop sends an authenticated cancellation request bound to the server-generated attempt ID, aborts upstream generation, and preserves partial text as failed before acknowledging cancellation. Private chat details restore the active attempt metadata so Stop also works after refresh or reopening the conversation. Retry reuses the original prompt and assistant row. Leaving a real conversation closes its browser request; hosting proxies may keep the server generating until completion or its bounded timeout, so use Stop first for explicit cancellation. The separate UI preview retains generation across chat navigation.

The three `OPENROUTER_MODEL_1/2/3` values define the server-side fallback order from SPEC.md. A model is tried once per request. Temporary errors, rate limits, unavailable models and first-token timeouts can fall back before text appears; credentials, invalid input and exhausted credit do not. Once response text reaches the client, failures remain visibly incomplete and never switch models mid-answer. Free-model availability and provider quotas can change independently of the app.

On November 13, 2026, the retired `nvidia/nemotron-3-nano-30b-a3b:free` fallback was replaced with `nvidia/nemotron-3.5-lightning:free`, verified in OpenRouter's catalog with matching pinned tokenizer artifacts. Existing installations must update `OPENROUTER_MODEL_3` in their private environment and restart the API; changing the default does not override an explicit environment value.

Defaults are 15 generation attempts per account per UTC day (including retries), 6,000 user characters, 20 completed history messages with a 24,000-character history bound, a 30,720-token input budget inside a shared 32,768-token context cap, a 1,024-token output limit and 1,024-token safety margin, a 15-second first-token deadline per candidate and a 90-second total request deadline. The server counts each candidate's formatted prompt using its pinned native tokenizer and published chat template, then trims oldest turns to fit. The safety margin covers possible differences in upstream provider formatting. See `server/.env.example` for configurable limits. Pending attempts abandoned after a crash become retryable after the total deadline plus a five-second grace period. An account's daily budget and each chat's generation guard are enforced in PostgreSQL, including across server processes.

Tokenizer files are downloaded from public Hugging Face repositories on first use, with a sixty-second download timeout. No prompts are sent to Hugging Face. The server keeps one tokenizer in memory; cold starts and switching fallback models can require downloading files again. Network access to Hugging Face and its download hosts is required. Cold downloads happen before the provider first-token timer starts and remain bounded by the total request deadline. The three default models have pinned tokenizer/template revisions in `server/src/modules/ai/tokenizer.ts`; changing model IDs also requires registering their matching artifacts there. A model with missing or unsupported tokenization is skipped before generation rather than using an approximate counter. The shared context cap must remain below all configured model limits. These local template counts do not guarantee identical provider billing counts.

Tests mock providers and never spend OpenRouter quota. For a bounded live smoke check, send one short non-private prompt and confirm a reply, its model label, and persistence after refresh. Do not repeatedly retry credential or quota failures.

Long conversations now keep a private rolling summary in PostgreSQL. When the primary model's input budget or the existing history bounds require compression, the server makes at most one extra primary-model call per send/retry (ten seconds, at most 512 output tokens), then saves the summary and its covered sequence. Later requests reuse it. Recent messages and all original saved messages are preserved; summaries are untrusted, lossy reference data, especially for file contents. Every fallback counts the summary in its own token budget. A failed optional summary falls back to normal history trimming; Stop and credential/credit errors are propagated. This extra call can consume provider quota and is included in the originating app generation attempt. Updates process at most 40 older messages, so a large existing backlog may need several sends to catch up. Summary requests that cannot fit are skipped safely.

Apply the new `20261111000000_conversation_summary` migration with `npm run db:migrate --workspace server` before starting the updated API. Summary text and its cursor are excluded from chat API responses and public snapshots.

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
- Real ownership-protected chat CRUD and message persistence, streaming responses, pre-content fallback, Stop, Retry, and per-account usage limits. The sidebar loads conversations in pages of 100 with **Load more conversations** for older chats.
- Durable public sharing after explicit confirmation: fixed title/completed-message snapshots, secure random tokens, atomic refresh/rotation, revocation and deletion invalidation. Public reads have no account metadata, use no-store/noindex headers and are limited to 60 requests per visitor per minute on the single API instance.

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

`client/src/lib/api.ts` expects `{ data: ... }` for application responses and `{ error: { code, message } }` for errors. Better Auth’s standard session and email/password endpoint response shapes are also supported. Chat detail expects `{ id, title, createdAt, updatedAt, messages }`; sharing state expects `{ url: string | null, sharedAt?: string }`; public snapshots expect `{ title, messages, sharedAt }`. Chat lists return `{ data: [...], nextCursor: string | null }`; pass `cursor` on the next request and optionally `limit` (1–100). Cursors encode the last timestamp/ID, so equal timestamps and deleted cursor rows remain supported. Refreshing the list starts again from the newest page.

The API mounts Better Auth at `/api/auth/*splat`, uses its Prisma PostgreSQL adapter, and protects chat routes with `auth.api.getSession`. CORS and mutation origins are allowlisted; auth mutations are limited both by Better Auth and a per-IP Express limiter. Private responses use `Cache-Control: no-store`. Proxy trust is off by default; `TRUST_PROXY_HOPS` configures a bounded ingress hop count and the Render Blueprint uses 1. Cookie caching is disabled so database revocation takes effect on subsequent requests. `/api/health` checks process liveness; `/api/ready` checks database connectivity with a three-second deadline and a safe 503 on failure.

The React client uses the official Better Auth SDK in `client/src/lib/auth-client.ts`; authentication is not decoded through the generic application request helper. Cookie sessions also revalidate on focus and auth changes through the SDK. No secrets belong in client environment variables.

Hosted auth rate limits use a normalized visitor IP shared by Express and Better Auth. Vercel adds a private verification header using `TRUSTED_PROXY_SECRET`; Render uses the first address in Vercel's sanitized `X-Forwarded-For` chain only when that secret matches. Configure the same private random value on both hosts, never with a `VITE_` prefix. With that setting enabled, direct origin API requests are rejected except for health/readiness probes. Without it, local access uses the actual socket IP, ignoring forwarded identities. Caller-supplied internal IP headers are overwritten. Streaming responses explicitly retain `Cache-Control: no-store`.

After pulling this update, run `npm run db:migrate --workspace server` before starting the API. Migration `20261116000000_sharing_and_chat_pagination` creates `ShareLink` and the chat pagination index. Database integration coverage includes snapshot immutability, ownership, concurrent rotation, revocation, chat deletion and lists beyond 100 chats; run it only against a dedicated `TEST_DATABASE_URL`. The preview generator is never a production data store. The new sharing release still needs PostgreSQL integration execution and authenticated browser verification before deployment.

Production SPA hosting must rewrite non-asset browser routes to `index.html`. The Vercel/Render setup keeps `VITE_API_BASE_URL=/api` and proxies API requests through Vercel before the SPA fallback. Both server auth/origin URLs use the stable frontend origin. Render runs migrations at startup against Neon because free web services have no pre-deploy command. Use a direct TLS database connection with `sslmode=verify-full` for this single API instance and keep production data separate from development. Set a private random secret and `NODE_ENV=production`; HTTPS is required and auth cookies are Secure, HTTP-only, SameSite=Lax. For local `npm run preview` on another port, configure and rebuild with the direct API base URL and allow that exact preview origin on the server. Public share responses must retain `noindex, nofollow` and no-store when implemented.

## Auth schema maintenance

The `User`, `Session`, `Account`, and `Verification` Prisma models were generated with Better Auth CLI 1.7.14; application models include `Chat`, `Message`, and `GenerationUsage`. To inspect an updated auth schema, run `npm run auth:generate --workspace server`. It writes an ignored `prisma/auth.generated.prisma` file so it cannot overwrite application models. Review the generated auth changes, preserve application relations, generate/review a new Prisma migration, then apply migrations and regenerate the Prisma client. Do not run destructive schema resets against existing data.

Integration references consulted via Context7: [Better Auth Express integration](https://better-auth.com/docs/integrations/express), [Prisma adapter](https://better-auth.com/docs/adapters/prisma), and [React client](https://better-auth.com/docs/concepts/client).

## Structure

Frontend custom classes use BEM: `block`, `block__element`, and `block--modifier` (or `block__element--modifier`). For example, `chat__header`, `message__body`, and `button button--primary`. Independent shared controls remain separate blocks; dialogs may mix `dialog` with `share-dialog` or `chat-actions-dialog`. Keep class names synchronized across JSX and both stylesheets, including responsive rules. Tailwind utilities and TipTap-generated classes keep their own naming conventions.

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
