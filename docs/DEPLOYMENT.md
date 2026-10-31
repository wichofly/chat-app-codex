# Free Vercel/Render demo deployment

This deployment uses Vercel for the frontend and free Render services for the API and a separate PostgreSQL database. Render's free database expires after 30 days and has no backups; the API sleeps when idle. This is a demo setup. Durable public sharing, email verification and password recovery remain unfinished or disabled.

Live resources: frontend `https://thread-chat-lovat.vercel.app`, API `https://thread-api-55l7.onrender.com`, and Frankfurt database `thread-chat-db`. The database expires on **November 30, 2026**. Export or upgrade it before that date to retain data. This separate database starts without local accounts or conversations.

## Verified release — October 31, 2026

Both the API and frontend run commit `577eac1`. Render deployment `dep-dbj63fo473hc73b8t4og` is live; Vercel deployment `dpl_DGxwC1ypTAAVFMwg2CpsDL6oZvKT` is ready and promoted to the public domain. Committed migrations applied successfully. Direct and proxied liveness/readiness checks returned 200; unauthenticated private API access returned 401. SPA deep links loaded successfully.

Chrome checks passed for guest redirects, sign-up/sign-in/sign-out, Secure/HTTP-only/SameSite=Lax cookie acceptance, session restoration after refresh, chat creation/rename/deletion with confirmation and cancel, and saved-message reload. A real `cohere/north-mini-code:free` response streamed and persisted. Explicit Stop preserved incomplete content; Retry completed without another user prompt. Desktop (1440×1000) and mobile (390×844) layouts were inspected; mobile had no horizontal page overflow, drawer focus entered navigation, and Escape restored menu focus. The unavailable public page exposed no composer or generation controls and had `noindex` metadata. Test conversations were deleted; disposable unverified test accounts remain. No uncaught browser errors or unexpected request failures were observed.

Local checks passed: 45 client tests, 39 server unit tests, 21 isolated PostgreSQL integration tests, the server type check, and production builds. Fallback/outage cases used mocked providers; healthy primary-model delivery and Stop/Retry used the live provider. No deliberate provider outage was induced. There is no configured linter. The build retains an existing large chat-chunk warning.

The Vercel runtime error scan and Render API error-level scan were empty during verification. Render did log a Better Auth warning: it could not resolve a trusted client IP and used a shared per-path rate-limit bucket. Authentication works, but verify the ingress IP headers/proxy trust before wider use; shared buckets can limit multiple users together. External alerting/drains were not configured in this deployment. Durable sharing, email verification and password recovery remain unavailable. This release is a free demo, not a completed production-hardening pass.

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

1. Create a separate free PostgreSQL database (`thread-chat-db`) and a free web service (`thread-api`) in Frankfurt. Use separate credentials/data from local development. The database must be exported or upgraded before its 30-day expiry if the data is needed afterward.
2. Keep the service root at the repository root so npm can access both workspaces and the root lockfile. The root `render.yaml` records the intended infrastructure and database binding. For a new Blueprint setup, import that file from Git; existing resources created through the CLI should continue to be managed through the CLI unless explicitly adopted into a Blueprint to avoid duplicate resources.
3. The free tier has no pre-deploy command. The start command runs committed Prisma migrations before starting Node and accepting traffic. Keep migrations backward compatible and deploy when no chat is generating; the free service's shutdown window may interrupt a long response.
4. Configure the server settings below. Generate and retain a separate random `BETTER_AUTH_SECRET` for this deployment; Blueprint setup uses `generateValue: true`. CLI deployment can upload a private dotenv secret file and set `DOTENV_CONFIG_PATH=/etc/secrets/thread-runtime.env`. This is an application secret, separate from account passwords and the Better Auth website.
5. The Vercel API rewrite targets `https://thread-api-55l7.onrender.com/api/:path*`. Update it if replacing the API service. Never commit database passwords, provider keys or auth secrets into either deployment file.
6. Confirm `/api/health` and `/api/ready` return 200 through both the API origin and Vercel proxy. Readiness queries PostgreSQL, returns a generic 503 on failure, and has a three-second response deadline. Concurrent probes reuse a stalled query instead of exhausting the connection pool. Readiness checks connectivity, not schema migration completeness; review the migration logs too.

| Setting | Value |
| --- | --- |
| Build | `npm ci --include=dev && npm run build --workspace server` |
| Start (Render Linux shell) | `npm run db:migrate --workspace server && exec node server/dist/index.js` |
| Health check | `/api/ready` |
| `NODE_VERSION` | `22` |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Your production PostgreSQL URL with provider-required TLS |
| `BETTER_AUTH_URL` | `https://thread-chat-lovat.vercel.app` |
| `CLIENT_ORIGIN` | `https://thread-chat-lovat.vercel.app` |
| `OPENROUTER_API_KEY` | Your server-only OpenRouter key |
| `TRUST_PROXY_HOPS` | `1` for the direct Render ingress described here |
| `TRUSTED_PROXY_SECRET` | A private random value of at least 32 characters, matching Vercel production |

The process binds to `0.0.0.0` and uses Render's supplied `PORT`; do not copy the local `PORT=3001` into the hosting settings. The Blueprint includes the application's budget and timeout defaults. Copy any intentional local overrides individually into Render settings; the private `server/.env` is not deployed. The model IDs default to those in `server/src/config.ts` and can be overridden server-side after verifying availability.

Proxy trust stays disabled locally (`TRUST_PROXY_HOPS=0`). Generate one separate random `TRUSTED_PROXY_SECRET` and configure it privately in both the Render service environment and Vercel's production environment, then deploy both services. Never prefix it with `VITE_`. The API verifies the proxy header with a constant-time digest comparison before accepting the first address in Vercel's sanitized `X-Forwarded-For` chain. Vercel replaces caller-supplied values; `x-real-ip` is absent at this API. With the secret configured, direct origin API requests return 403 unless the path is `/api/health` or `/api/ready`; browser and public-share requests use the canonical Vercel proxy. Local access without the secret uses the actual socket peer IP and ignores forwarded identities, even if Express proxy hops are configured. All caller-supplied internal IP headers are overwritten. Express and Better Auth use the normalized identity, with IPv6 subnet handling. A verified request with a missing or invalid visitor address returns 400. The auth IP limiter uses process memory, so this Blueprint stays at one instance; review distributed rate limiting before scaling it. Do not increase proxy hops or trust arbitrary forwarded addresses to resolve IP warnings. Coordinate API/frontend rollback: a frontend without the verification header cannot access an API enforcing it.

Vercel's external proxy does not reliably propagate browser aborts to the API. The Stop button sends an authenticated request bound to the server's generation ID and waits for partial-response persistence before stopping local reading. Private chat details include the current attempt identifiers, so Stop remains available after refresh or reopening a pending conversation. No action metadata is exposed in public snapshots. Streaming headers explicitly preserve `Cache-Control: no-store`. Keep the API at one instance: provider cancellation also uses a process-local registry. Database guards still enforce message ordering/concurrency. Scaling requires distributed cancellation and rate limiting. Closing a tab or losing a connection can leave generation running behind the proxy until completion or the bounded server timeout.

Automatic Render deploys are initially off to coordinate schema/API/client releases. Deploy API changes first, verify them, then publish the frontend. Export important data before migrations; free Postgres has no automatic backups. App rollbacks do not reverse database migrations; schema changes must remain compatible with any version that can still run. Do not use `db push`, schema resets, or destructive automatic down-migrations.

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
6. Record the deployed revision, URLs, test outcomes, and any failures. The sharing API still returns unavailable/not-found responses; memory-only preview links are not durable public links.

## References

- [Vercel Vite SPA deployment](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel monorepos](https://vercel.com/docs/monorepos)
- [Render Blueprint reference](https://render.com/docs/blueprint-spec)
- [Render deployment commands](https://render.com/docs/deploys)
- [Render Node version selection](https://render.com/docs/node-version)
- [Render health checks](https://render.com/docs/health-checks)
- [Better Auth cookies](https://better-auth.com/docs/concepts/cookies)
- [Express behind proxies](https://expressjs.com/en/guide/behind-proxies.html)
