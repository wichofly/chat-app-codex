# Vercel frontend, Render API and Neon database

The deployment configuration uses Vercel for the frontend, a free Render web service for the Express API, and Neon for PostgreSQL. Render's API sleeps when idle. This is a demo setup; email verification and password recovery remain disabled. Durable public sharing is implemented locally and awaits verification and deployment.

## Prepared sharing and pagination release — November 16, 2026

Migration `20261116000000_sharing_and_chat_pagination` adds the `ShareLink` table and a composite chat pagination index. Deploy the API with this migration before publishing the updated frontend. Existing chat list consumers still receive a `data` array; the updated sidebar reads `nextCursor` to load older pages. Apply migrations using the existing startup command; never reset an existing database. This release has not been deployed or verified in a real browser or a designated PostgreSQL test database.

Before publication, run `npm run test:integration` with a dedicated `TEST_DATABASE_URL`, then verify owner share confirmation, unauthenticated read-only access, unchanged snapshots after new messages/renames, refresh revoking the old URL, Disable link, and chat deletion. Verify older chats remain accessible after loading more than 100 conversations. Public snapshots must exclude account/model/action metadata and private summaries, retain no-store/noindex headers, and reject invalid/revoked tokens with the same 404. The public limiter is per process; keep the existing single API instance assumption.

Public URLs: frontend `https://thread-chat-lovat.vercel.app` and API `https://thread-api-55l7.onrender.com`. Neon stores production data in `thread_production`, separate from the local development database. The old Render database `thread-chat-db` is retained as a read-only recovery copy and expires on **November 30, 2026**. The October 31 and November 1 release records below describe the original Render database deployment.

## Production database correction — November 13, 2026

Render deployment `dep-dbrn41u7bikc73b1m2jg` is live on commit `8564e8b` (application code unchanged from `fe4fed0`). The previous deployment's explicit `DATABASE_URL` pointed to development database `neondb`. The service now uses the existing `thread_production` connection, directly over TLS with `sslmode=verify-full`. Its startup datasource log confirmed the intended database and the committed conversation-summary migration applied successfully.

Read-only checks confirmed that both databases have all three completed migrations and both summary columns. Development accounts and conversations remain separate from production. Direct and Vercel-proxied readiness returned 200, proxied liveness returned 200, and an unauthenticated private chat request returned 401; all retained `Cache-Control: no-store`. No authenticated browser streaming check was performed during this configuration correction.

## API compatibility update — November 13, 2026

Render deployment `dep-dbrmk6u1egvs73cs5p2g` reached live on commit `fe4fed0` and was superseded by the database correction above. It replaced API commit `333c4c0`, whose strict message validation rejected the deployed frontend's `persona` field with HTTP 400. The locally built frontend asset names matched the public Vercel build, so this release updated the API only. Automatic Render deploys remain off.

The production build and all 96 database-independent server tests passed before deployment. Startup found three committed migrations and no pending migrations, but this check was against the mistakenly configured `neondb`, not `thread_production`. Direct and Vercel-proxied health/readiness probes returned 200 with `Cache-Control: no-store`; an unauthenticated private chat request returned 401. An authenticated browser chat and live model generation were not tested as part of this deployment.

## Verified Neon migration — November 4, 2026

Render deployment `dep-dblm9d15efls73e6p5u0` redeployed the existing API build (`333c4c0`) with the direct Neon production connection. No application dependency or frontend routing change was required. The two committed Prisma migrations matched the source schema. All records in the seven application tables were copied and compared: 5 users, 5 accounts, 10 sessions, 2 chats, 8 messages and 6 daily usage counters; verification was empty. Existing auth/proxy secrets were preserved, and temporary source-network access was removed after transfer. The obsolete database credential was removed from the Render secret file; the explicit service `DATABASE_URL` is now the connection setting.

Direct and Vercel-proxied readiness returned 200. Chrome checks passed sign-up, sign-in, sign-out, session restoration, chat create/rename/delete, saved responses after refresh, a bounded real OpenRouter response, and desktop/mobile navigation. The disposable browser account was confirmed in Neon, then removed with its test data. No uncaught browser errors or unexpected network failures were observed. The production build and Render Blueprint validation passed. Free API startup delays and unfinished sharing/email features remain as described below.

## Move existing data to Neon

1. Create an empty production database in Neon, separate from development. For the existing PostgreSQL 18 source, use PostgreSQL 18 or newer. Keep its connection string private; `server/.env.production.local` is ignored by Git and Vercel uploads and is not automatically loaded by local development.
2. Use a direct Neon connection with TLS for the API's `DATABASE_URL`. This single Express instance already pools connections through `pg`; a separate Neon pooler and migration URL are unnecessary for this setup. Never put the database URL in Vercel or a `VITE_` variable.
3. Pause API writes and wait for active generations to finish before the final export. Preserve all users, password hashes, sessions, chats, messages and usage counters. With `pg_dump`/`pg_restore`, use tools at least as new as the source server, a direct connection, and `--no-owner --no-acl`. Keep the old database available for recovery.
4. Restore into the empty Neon database. Verify migrations, row counts and content before switching traffic. Do not reset or merge into an existing development database.
5. Set `DATABASE_URL` privately on the existing Render `thread-api` service and redeploy. Keep the existing auth and proxy secrets and both frontend origin settings. An explicit Render environment variable overrides a value loaded by this app's dotenv secret file; `DOTENV_CONFIG_PATH` can keep pointing to the existing secret file for the remaining settings.
6. Verify readiness through Vercel, authentication/session restoration, owned chat persistence and a bounded streamed response. Confirm new records appear in Neon. Remove the obsolete database credential from the Render secret file once recovery is no longer needed. Delete `thread-chat-db` only after confirming retention and recovery needs.

Changing `render.yaml` does not migrate data or switch an existing service. Its `DATABASE_URL: sync: false` declaration prompts on initial Blueprint creation; existing services need the private value configured explicitly. The Blueprint provisions only the API and does not create a Render database.

## Verified release — October 31, 2026

Both the API and frontend run commit `577eac1`. Render deployment `dep-dbj63fo473hc73b8t4og` is live; Vercel deployment `dpl_DGxwC1ypTAAVFMwg2CpsDL6oZvKT` is ready and promoted to the public domain. Committed migrations applied successfully. Direct and proxied liveness/readiness checks returned 200; unauthenticated private API access returned 401. SPA deep links loaded successfully.

Chrome checks passed for guest redirects, sign-up/sign-in/sign-out, Secure/HTTP-only/SameSite=Lax cookie acceptance, session restoration after refresh, chat creation/rename/deletion with confirmation and cancel, and saved-message reload. A real `cohere/north-mini-code:free` response streamed and persisted. Explicit Stop preserved incomplete content; Retry completed without another user prompt. Desktop (1440×1000) and mobile (390×844) layouts were inspected; mobile had no horizontal page overflow, drawer focus entered navigation, and Escape restored menu focus. The unavailable public page exposed no composer or generation controls and had `noindex` metadata. Test conversations were deleted; disposable unverified test accounts remain. No uncaught browser errors or unexpected request failures were observed.

Local checks passed: 45 client tests, 39 server unit tests, 21 isolated PostgreSQL integration tests, the server type check, and production builds. Fallback/outage cases used mocked providers; healthy primary-model delivery and Stop/Retry used the live provider. No deliberate provider outage was induced. There is no configured linter. The build retains an existing large chat-chunk warning.

The Vercel runtime error scan and Render API error-level scan were empty during verification. Render did log a Better Auth warning: it could not resolve a trusted client IP and used a shared per-path rate-limit bucket. Authentication works, but verify the ingress IP headers/proxy trust before wider use; shared buckets can limit multiple users together. External alerting/drains were not configured in this deployment. Durable sharing, email verification and password recovery remain unavailable. This release is a free demo, not a completed production-hardening pass.

## Verified review fixes — November 1, 2026

The API now runs `333c4c0` (Render deployment `dep-dbj7550u01pc73el6fp0`); the frontend runs `6a1803e` (Vercel deployment `dpl_Huy5u8882EY5C1q6SwNUuMXFzFk6`). The production domain remains unchanged. These revisions resolve the shared auth identity, restored Stop, and private streaming cache findings. The earlier IP warning above describes the initial release; verified Vercel traffic now supplies a normalized visitor identity to both auth limiters.

Live Chrome verification passed authentication/session restoration, saved chats, desktop/mobile navigation, Stop after reloading a pending conversation, Retry without duplicated prompts, destructive confirmation and public-page restrictions. All three observed AI stream responses retained `Cache-Control: no-store`. Controlled logins with forged IP headers resolved to the same identity as ordinary proxied logins; direct origin API access was rejected and test sessions were revoked. Verification used disposable accounts/conversations and bounded model calls.

Local checks passed 47 client tests, 41 server unit tests and 21 PostgreSQL integration tests, plus the server type check and production build. `auth.config.ts` also passed the Better Auth schema-generation command, writing only the ignored generated schema. That file is a CLI schema configuration; production authentication settings live in `server/src/lib/auth.ts`.

The proxy change was initially rolled back when live validation showed that `x-real-ip` was absent. The corrected deployment uses the verified `X-Forwarded-For` chain and passed staged HTTP/database-readiness checks before publication. The public origin remains protected without trusting caller-supplied forwarded identities. The free-tier and unfinished-feature limitations still apply.

## Domains and cookies

The browser uses `https://thread-chat-lovat.vercel.app` and calls `/api` on that same origin. The first route in `client/vercel.json` forwards these requests to Render and overwrites `x-thread-proxy-secret` from the private `TRUSTED_PROXY_SECRET` environment variable. Filesystem asset handling and the SPA fallback follow that route. Configure both `BETTER_AUTH_URL` and `CLIENT_ORIGIN` with the frontend origin, and leave `VITE_API_BASE_URL` unset or set it to `/api`. Host-only HTTP-only cookies are then stored for the frontend host; cross-subdomain cookie sharing is unnecessary.

`SameSite=Lax` cookies cannot authenticate direct cross-site fetches between unrelated `vercel.app` and `onrender.com` domains, so keep browser API traffic on the Vercel proxy. CORS does not override this browser policy. Keep `CLIENT_ORIGIN` exact, without a trailing slash; it configures both CORS and Better Auth trusted origins. Do not allow arbitrary preview URLs to use production accounts.

## Before publishing

Run these commands from the repository root on Node 22.12 or newer within the Node 22 major:

```sh
npm ci --include=dev
npm run build
npm run typecheck --workspace server
npm run test --workspace client -- --maxWorkers=1
npm run test --workspace server
```

Run `npm run test:integration` only with `TEST_DATABASE_URL` set to a dedicated test database. The suites create/drop their own isolated schemas and mock model calls. Never point this command at production.

## Deploy the Render API

1. Create a dedicated Neon production database and a free Render web service (`thread-api`) in Frankfurt. Choose a nearby Neon region when creating a new project and keep production data separate from development.
2. Keep the service root at the repository root so npm can access both workspaces and the root lockfile. The root `render.yaml` defines the API and prompts for the private Neon connection string. For a new Blueprint setup, import that file from Git; existing resources created through the CLI should continue to be managed through the CLI unless explicitly adopted into a Blueprint to avoid duplicate resources.
3. The free tier has no pre-deploy command. The start command runs committed Prisma migrations before starting Node and accepting traffic. Keep migrations backward compatible and deploy when no chat is generating; the free service's shutdown window may interrupt a long response.
4. Configure the server settings below. Generate and retain a separate random `BETTER_AUTH_SECRET` for this deployment; Blueprint setup uses `generateValue: true`. CLI deployment can upload a private dotenv secret file and set `DOTENV_CONFIG_PATH=/etc/secrets/thread-runtime.env`. This is an application secret, separate from account passwords and the Better Auth website.
5. The Vercel API rewrite targets `https://thread-api-55l7.onrender.com/api/:path*`. Update it if replacing the API service. Never commit database passwords, provider keys or auth secrets into either deployment file.
6. Confirm `/api/health` and `/api/ready` return 200 through both the API origin and Vercel proxy. Readiness queries PostgreSQL, returns a generic 503 on failure, and has a three-second response deadline. Concurrent probes reuse a stalled query instead of exhausting the connection pool. Readiness checks connectivity, not database identity or schema migration completeness; confirm the startup datasource is `thread_production` and review migration results too.

| Setting                    | Value                                                                        |
| -------------------------- | ---------------------------------------------------------------------------- |
| Build                      | `npm ci --include=dev && npm run build --workspace server`                   |
| Start (Render Linux shell) | `npm run db:migrate --workspace server && exec node server/dist/index.js`    |
| Health check               | `/api/ready`                                                                 |
| `NODE_VERSION`             | `22`                                                                         |
| `NODE_ENV`                 | `production`                                                                 |
| `DATABASE_URL`             | Direct Neon production PostgreSQL URL with TLS                               |
| `BETTER_AUTH_URL`          | `https://thread-chat-lovat.vercel.app`                                       |
| `CLIENT_ORIGIN`            | `https://thread-chat-lovat.vercel.app`                                       |
| `OPENROUTER_API_KEY`       | Your server-only OpenRouter key                                              |
| `TRUST_PROXY_HOPS`         | `1` for the direct Render ingress described here                             |
| `TRUSTED_PROXY_SECRET`     | A private random value of at least 32 characters, matching Vercel production |

The process binds to `0.0.0.0` and uses Render's supplied `PORT`; do not copy the local `PORT=3001` into the hosting settings. The Blueprint includes the application's budget and timeout defaults. Copy any intentional local overrides individually into Render settings; the private `server/.env` is not deployed. The model IDs default to those in `server/src/config.ts` and can be overridden server-side after verifying availability.

Proxy trust stays disabled locally (`TRUST_PROXY_HOPS=0`). Generate one separate random `TRUSTED_PROXY_SECRET` and configure it privately in both the Render service environment and Vercel's production environment, then deploy both services. Never prefix it with `VITE_`. The API verifies the proxy header with a constant-time digest comparison before accepting the first address in Vercel's sanitized `X-Forwarded-For` chain. Vercel replaces caller-supplied values; `x-real-ip` is absent at this API. With the secret configured, direct origin API requests return 403 unless the path is `/api/health` or `/api/ready`; browser and public-share requests use the canonical Vercel proxy. Local access without the secret uses the actual socket peer IP and ignores forwarded identities, even if Express proxy hops are configured. All caller-supplied internal IP headers are overwritten. Express and Better Auth use the normalized identity, with IPv6 subnet handling. A verified request with a missing or invalid visitor address returns 400. The auth IP limiter uses process memory, so this Blueprint stays at one instance; review distributed rate limiting before scaling it. Do not increase proxy hops or trust arbitrary forwarded addresses to resolve IP warnings. Coordinate API/frontend rollback: a frontend without the verification header cannot access an API enforcing it.

Vercel's external proxy does not reliably propagate browser aborts to the API. The Stop button sends an authenticated request bound to the server's generation ID and waits for partial-response persistence before stopping local reading. Private chat details include the current attempt identifiers, so Stop remains available after refresh or reopening a pending conversation. No action metadata is exposed in public snapshots. Streaming headers explicitly preserve `Cache-Control: no-store`. Keep the API at one instance: provider cancellation also uses a process-local registry. Database guards still enforce message ordering/concurrency. Scaling requires distributed cancellation and rate limiting. Closing a tab or losing a connection can leave generation running behind the proxy until completion or the bounded server timeout.

Automatic Render deploys are initially off to coordinate schema/API/client releases. Deploy API changes first, verify them, then publish the frontend. Export important data before migrations and check the selected Neon plan's recovery limits. App rollbacks do not reverse database migrations; schema changes must remain compatible with any version that can still run. Do not use `db push`, schema resets, or destructive automatic down-migrations.

## Deploy the Vercel frontend

1. Import the same repository into Vercel and choose `client` as the project Root Directory. Keep access to files outside that directory enabled for the workspace lockfile/install.
2. Use the Vite framework preset. `client/vercel.json` sets `npm ci --include=dev` as the install command, `npm run build` as the build command, `dist` as output, and ordered API/filesystem/SPA routes for direct navigation/refreshes. Configure the matching `TRUSTED_PROXY_SECRET` as a production Secret before deploying; the API route references it by name, never by a committed value.
3. Leave `VITE_API_BASE_URL` unset (the default is `/api`) or explicitly set it to `/api`. A direct backend origin would bypass the same-origin proxy and break default-domain cookie sessions. Keep server secrets entirely in Render.
4. Use Node 22.x; the client package's engine range prevents automatic upgrades to an untested major.
5. Use the assigned stable domain `https://thread-chat-lovat.vercel.app`. If you later change the frontend domain, update both server origins before testing login on the new domain.
6. Keep frontend previews on the memory-only UI preview or connect them to a separate staging API/database with matching exact origins. Never automatically trust all Vercel preview hosts on the production API.

For CLI deployment, run from the repository root with the explicit project/team; the project Root Directory remains `client`. The root `.vercelignore` excludes local environment files, CLI sessions, browser profiles, generated files and temporary tools. Check `vercel deploy --dry --json` before uploading. The CLI also respects its built-in exclusions; Git ignore rules alone do not define the upload boundary.

The frontend calls the same-origin `/api` proxy; no Vercel Function is required. API routes must match before the SPA catch-all so API errors are not replaced with `index.html`. `/chats/...` and `/shared/...` should return the SPA when opened directly; the API independently enforces session and ownership.

## Verify the deployed environment

Use disposable test data and a bounded live model request:

1. Open a private browser window. Confirm private routes redirect to login. Register an account, sign out, sign in, refresh, and confirm the session survives. Sign out again and confirm private API requests return 401. Inspect cookies without copying their values: they should be Secure, HTTP-only and SameSite=Lax.
2. Create and rename a conversation, refresh, and confirm persistence. Confirm another account cannot open it. Delete only the test conversation after checking confirmation behavior.
3. Send one short non-private prompt. Confirm incremental text, selected model metadata, and persistence after refresh. In a separate short test, Stop should preserve a failed partial reply and Retry should reuse the prompt once. Retain the per-account daily limit.
4. Exercise fallback with mocked providers locally and in staging, including failures before text, errors after partial text, and cancellation. Production smoke tests verify healthy delivery; they do not prove all fallback branches. Avoid deliberate provider outages or repeated quota-consuming retries in production.
5. Check network requests/console errors and route refreshes at desktop and mobile widths. Check API logs for model IDs/failure categories without private prompts, keys, cookies, or password values.
6. Record the deployed revision, URLs, test outcomes, and any failures. Until the prepared sharing release is deployed, the live sharing API still returns unavailable/not-found responses. After deployment, verify durable links in a separate signed-out browser; memory-only preview links remain separate.

## References

- [Vercel Vite SPA deployment](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel monorepos](https://vercel.com/docs/monorepos)
- [Render Blueprint reference](https://render.com/docs/blueprint-spec)
- [Render deployment commands](https://render.com/docs/deploys)
- [Neon Node.js connections](https://neon.com/docs/guides/node)
- [Migrate from Render to Neon](https://neon.com/docs/import/migrate-from-render)
- [Render Node version selection](https://render.com/docs/node-version)
- [Render health checks](https://render.com/docs/health-checks)
- [Better Auth cookies](https://better-auth.com/docs/concepts/cookies)
- [Express behind proxies](https://expressjs.com/en/guide/behind-proxies.html)
