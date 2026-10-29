# Chat App repository instructions

## Project overview and context

Thread is a small, multi-user, text-only AI chat application with saved conversations, rich-text prompts, streamed assistant responses, and revocable, read-only public snapshots.

Before starting work:

1. Read [SPEC.md](SPEC.md), the source of truth for requirements, architecture, API contracts, security rules, and acceptance criteria. If it is renamed to `SPEC.md`, read that file instead. Do not silently resolve conflicting specifications or invent requirements.
2. Read [ROADMAP.md](ROADMAP.md) for implementation priorities and the scope of the current phase, then [README.md](README.md) for setup and known limitations. Phase-specific exclusions do not remove requirements from the full MVP.
3. Inspect the relevant source, package manifests, lockfile, configuration, tests, and applicable directory instructions. Preserve existing user changes and keep edits focused on the requested task.

### Current implementation and intended architecture

- The repository uses npm workspaces with `client/` and `server/` workspaces. Use npm and maintain `package-lock.json`; Node must satisfy the root `engines` requirement (currently 22.12+).
- The existing client uses React 19, strict TypeScript, Vite, React Router, Tailwind CSS, TipTap, Lucide icons, Vitest, and React Testing Library with jsdom.
- Client organization: `app/` for routes/providers, `components/` for reusable UI, `features/` for auth/chats/sharing, `lib/` for API contracts/helpers, `styles/` for styling, and `test/` for tests.
- The `server/` workspace uses Node.js 22+/Express 5, TypeScript ESM, Zod, Better Auth, PostgreSQL, and Prisma for authentication and owned chat/message persistence. AI SDK 7/OpenRouter streaming, fallback, cancellation and idempotent retry are implemented; durable sharing remains future work. Follow the spec's modular structure; do not import server modules into the client.
- The current UI preview is explicitly labeled, memory-only, and separate from production API contracts. It resets on refresh, preserves per-chat generation across navigation, and cancels generation timers and clears preview data on exit. Do not present simulated responses, accounts, or share links as real services or durable persistence.

## TypeScript and code quality

- Keep TypeScript strict, including existing unused-code checks. Use explicit, meaningful types at public boundaries and where inference would obscure intent.
- Avoid `any`, unnecessary type assertions, non-null assertions, unused code, and suppression comments that hide unresolved problems. Narrow unknown external data through validation.
- Apply SOLID pragmatically, especially Single Responsibility. Prefer small, readable functions and focused modules over speculative abstractions or extra layers.
- Follow surrounding code conventions. Avoid unrelated formatting, dependency upgrades, or architecture changes.
- Check installed dependency versions and official documentation before relying on changing library APIs. Use compatible current best practices rather than copying examples for another major version.

## Frontend development

- Follow React 19 recommended patterns. Use functional components and custom hooks where they clarify reusable behavior; keep rendering pure and clean up effects, subscriptions, and timers.
- Keep business logic and service state separate from presentation when beneficial. Preserve the distinction between production API adapters and preview-only behavior.
- Use Tailwind CSS consistently with the existing theme and shared CSS conventions. Reuse accessible components and preserve current branding unless the task requests design changes.
- Preserve the specified routes: `/login`, `/signup`, `/chats`, `/chats/:chatId`, `/shared/:token`, and the Not Found fallback. Client route guards supplement server authorization; they do not enforce ownership securely by themselves.
- Support responsive layouts, keyboard navigation, visible focus, dialog focus management, loading/empty/error states, and destructive-action confirmation. Keep replies readable and code blocks within mobile layouts.
- Preserve composer formatting, Enter-to-send, Shift+Enter newline, IME handling, empty-message rejection, and configured size limits. Prevent concurrent sends in one chat; provide generating, Stop, and safe Retry states without duplicated user prompts.
- Public snapshots must remain read-only and expose no composer, owner actions, generation controls, or account-only metadata. Preserve `noindex, nofollow` behavior.

## Backend development

- Follow a modular Express architecture. Keep HTTP controllers/routes, business services, validation, and database access appropriately separated without adding unnecessary layers.
- Validate external inputs with Zod, including structured document size/depth, IDs, titles, and allowed URL schemes. Handle errors consistently with the spec's response envelopes, status codes, and in-stream error behavior.
- Check the Better Auth session and resource ownership on every private endpoint. Derive user identity server-side; never trust browser-supplied owner IDs or conversation history. Use the specified generic 404 behavior for non-owned chats and invalid/revoked shares.
- Load bounded, completed conversation history from PostgreSQL. Use transactions and database-backed generation guards for message ordering, idempotency, and same-chat concurrency.
- Follow the spec for credentialed CORS, trusted origins, CSRF/origin checks, rate limits, cancellation, pending-message recovery, and `Cache-Control: no-store`. Never expose internal error traces or log private prompts by default.

## Authentication, database, AI, and rich text

- Use Better Auth email/password authentication with database-backed sessions. Let Better Auth handle password hashing and verification and generate its internal Prisma models; do not hand-write or overwrite those internals.
- Preserve the demo's disabled email verification and absent password recovery, OAuth, and email service. Keep the password-recovery limitation visible; do not describe the demo configuration as production-ready.
- Use PostgreSQL and Prisma for durable users, chats, messages, and shares. Do not substitute MongoDB, localStorage, or preview fixtures as the production source of truth.
- Keep credentials and API keys server-only, out of source control, browser bundles, `VITE_` variables, logs, and public snapshots. Use placeholder values in environment examples.
- Follow the spec for Vercel AI SDK `useChat`, the installed SDK's UI Message Stream protocol, and the official OpenRouter provider. The server owns model selection and fallback; the client must not choose arbitrary models.
- Attempt only the specified qualifying fallbacks before assistant text reaches the client. Never switch models mid-answer or blindly retry invalid input/credentials. Bound timeouts, propagate cancellation, persist the actual model/status, and reuse the original user message on retry. Keep model configuration server-side and verify availability rather than assuming free models stay available.
- Treat allowlisted TipTap JSON (`contentJson`) as authoritative. Validate nodes and marks, derive model-facing plain text server-side, and keep frontend/server allowlists consistent. Never trust AI-produced HTML or store rendered HTML as another source of truth.
- Render safely, allow only `http:`/`https:` links, and reject unsafe embeds/scripts. Convert completed assistant text/Markdown to restricted TipTap JSON; if conversion fails, preserve the answer as valid paragraph-only JSON.
- Sharing captures a fixed snapshot of completed messages after an explicit warning/confirmation. Allow one active link per chat; refresh rotates its secure token and revokes the old link, disable revokes access, and chat deletion invalidates sharing. Later private messages must never update an existing snapshot.

## Testing and verification

- After code changes, run relevant TypeScript checks, configured linting, and tests. Use the actual package scripts rather than inventing commands or claiming unavailable checks passed.
- From the root, `npm run build` checks/builds both workspaces; `npm test` runs client and database-independent server tests. `npm run test:integration` requires TEST_DATABASE_URL and verifies PostgreSQL authentication and AI message persistence/cancellation in isolated schemas with mocked models. `npm run typecheck --workspace server` also checks server test types. `npm run dev` starts Vite; `npm run dev:server` starts Express. See README for migrations and environment setup.
- No lint script or linter configuration currently exists. Run applicable lint scripts when configured; otherwise report linting as unavailable. Do not introduce a linter solely to satisfy this instruction.
- Verify changed behavior against SPEC.md acceptance criteria and the applicable roadmap requirements. Add focused behavior/regression tests for meaningful changes; use fake timers for simulated generation and mocked providers for failure boundaries.
- Preserve coverage for route access, keyboard/composer behavior, safe rich-text rendering, generation/Stop/Retry, navigation cleanup, and snapshot immutability/revocation. When backend work is introduced, include ownership/authentication, persistence/CRUD, share lifecycle, idempotency, and fallback/partial-stream integration tests as specified.
- Check desktop/mobile layouts in a browser when available. Clearly report checks that failed, could not run, or were not performed; preview/UI tests do not prove real authentication, database persistence, or provider streaming.
- For documentation-only changes, verify accuracy, links, and commands; runtime checks are unnecessary unless the changes affect execution. Keep README and roadmap information aligned with delivered behavior, and report remaining limitations.

Keep this file concise and maintainable: retain durable repository guidance here, and leave detailed feature requirements, model lists, and phase-specific checklists in the spec and roadmap.
