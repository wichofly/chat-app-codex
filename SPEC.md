# Chat App — Product & Technical Specification

**Version:** 1.0 (MVP handoff)  
**Prepared:** 28 October 2026  
**Status:** Proposed specification; implementation-ready with documented assumptions  
**Product:** A small, multi-user AI chat application that saves conversations and supports revocable, read-only public sharing.

---

## 1. Product goals

A registered user can sign in, start a conversation with an AI assistant, compose rich-text prompts, receive streamed answers, find and rename past conversations, delete conversations, and share a snapshot through a public link. A visitor without an account can open a valid link and read its content but cannot change anything or send messages.

**Primary goal:** demonstrate a clean React 19 + TypeScript frontend and Node.js/Express API with real database persistence, secure authentication, AI provider integration, streaming, and ownership-aware routes.

**Scope principle:** one developer-friendly MVP, not a fully featured ChatGPT clone.

### Definitions

- **Chat / conversation:** an ordered collection of user and assistant messages, owned by one user.
- **Message:** one user prompt or one assistant response.
- **Rich text:** an allowlisted TipTap/ProseMirror JSON document, displayed as safely rendered HTML/React elements.
- **Public share:** a read-only **snapshot** of a chat as it existed when the user shared it. Subsequent private messages do not become public automatically.
- **Fallback:** on qualifying provider failures *before response content is delivered*, try the next configured general-chat model.

### Assumptions adopted for this specification

1. This is a **text-only** AI chat app; uploads, image input, voice, attachments, tools, and web browsing are out of scope.
2. User messages are composed with TipTap. Assistant responses are streamed as text/Markdown, then transformed into a supported TipTap JSON document for durable storage and display. The server **never trusts raw AI-produced HTML**.
3. “Edit chat” means **rename the conversation**. Users may edit a prompt *before sending*; editing previously sent prompts and regenerating later turns is deferred to a later version.
4. Only signed-in users can create chats and invoke the AI. Unauthenticated visitors may only read public shares.
5. Only one active public link per chat. Sharing again refreshes the snapshot and **rotates the token**; older links stop working.
6. The OpenRouter API key is configured by the developer on the **server**; end users do not supply API keys.
7. Interface language is English for MVP; user prompts and model responses may use other languages.

## 2. Recommended stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite | Fast SPA development; no Next.js requirement |
| UI | Tailwind CSS; React Router | Styling and client-side routes |
| Chat UI | `@ai-sdk/react` (`useChat`) | Streaming state and chat UX |
| Editor | TipTap + StarterKit + Link | Controlled, structured rich-text input |
| API | Node.js **22+**, Express **5**, TypeScript, ESM | Separate backend, current SDK compatibility |
| Validation | Zod | Runtime validation and typed contracts |
| AI | Vercel AI SDK (`ai`) + `@openrouter/ai-sdk-provider` | Streaming and OpenRouter integration |
| Authentication | Better Auth, email/password only | Managed sessions with httpOnly cookies |
| Database | **PostgreSQL** | Durable users/chats/messages; JSONB for TipTap documents |
| ORM | Prisma | Type-safe access and schema migrations |
| Testing | Vitest, React Testing Library, Supertest | Unit, UI and HTTP integration tests |

**Database decision:** use PostgreSQL, not MongoDB. This product has clearly relational entities (user → chat → messages, chat → share link). PostgreSQL stores TipTap JSON directly using `jsonb` via Prisma's `Json` type. MongoDB would also work, but it provides no meaningful simplification for this project. Do not use browser localStorage as the source of truth.

**Dependency note:** OpenRouter's official AI SDK provider's v3 series documents AI SDK v7 and Node 22+. Pin compatible release versions in the lockfile; verify the installed package APIs before implementing.

## 3. MVP feature requirements

### 3.1 Authentication

- Sign up with **name, email and password**. Name is the display label required by the default Better Auth email sign-up flow; no social authentication.
- Sign in with email and password; sign out; restore session on refresh.
- Passwords must be hashed and verified **by Better Auth**, never stored or logged in plaintext.
- `emailAndPassword.enabled = true` and `requireEmailVerification = false`.
- No verification emails, password reset emails, forgot-password UI, OAuth or email service.
- Explicitly inform demo users that **forgotten passwords cannot be recovered** in this version.
- All chat-related mutations and reads require a valid session except the public share endpoint.

### 3.2 Chat management

- Create an empty chat, initially titled “New chat”.
- List only the signed-in user's chats, most recently updated first.
- Open a chat and display messages in chronological order.
- Rename a chat (1–100 visible characters) and delete a chat after confirmation.
- Deleting a chat removes its messages and invalidates its share link.
- Sidebar includes **New chat**, a chat list, rename, delete and sign-out.
- Store chat data in PostgreSQL so it survives browser refresh, logout and new sessions.

### 3.3 Compose and send messages

- TipTap composer, with an intentionally small toolbar: bold, italic, bullet list, ordered list, link, inline code and paragraphs; optional code block and headings (H2/H3).
- `Enter` sends a message; `Shift+Enter` creates a newline. Do not send empty/whitespace-only content.
- Validate and store a TipTap JSON document. Extract plain text (or a text-equivalent representation) server-side before constructing AI context.
- Display the user's message immediately, then stream the assistant's answer progressively.
- Show “Generating…” state, prevent concurrent sends in the **same chat**, offer **Stop generation**, and show a clear error/retry action when generation fails.
- No message editing or deletion once sent in MVP; renaming and deleting the enclosing chat are supported.

### 3.4 AI responses

- Use the **Vercel AI SDK**, with OpenRouter as the upstream provider.
- Stream text to the React UI. Do not wait for the full assistant response before displaying it.
- For each request, send a short server-controlled system instruction and a bounded history of **completed** prior user/assistant messages in chronological order.
- The server selects the model and owns fallback logic. The client may display the final model name, but cannot send arbitrary model IDs.
- Save each completed assistant response and the actual model ID used. Convert Markdown/text to allowlisted TipTap JSON after completion. On refresh, render from stored JSON.
- No autonomous tool-calling, browser retrieval, image generation or hidden long-running tasks.

### 3.5 Public sharing

- Owner clicks **Share**, sees a warning that the selected chat messages become accessible to anyone possessing the link, and confirms.
- Server captures the **chat title and all completed user/assistant messages at that moment** into a snapshot. Do not include system prompts, session information, emails or API keys.
- Server generates an unguessable URL such as `https://<frontend-host>/shared/<token>`; token generated using a cryptographically secure random source (at least 128 bits of entropy).
- Anyone with a valid active token can open a read-only page without signing in.
- Owner may copy the current URL, **refresh shared snapshot** (which issues a new URL and revokes the old one), or **Disable link**.
- Revoked, nonexistent and deleted-chat links all return a generic Not Found view (HTTP 404 from API).
- Guest share page has **no editor**, **no Send action**, **no rename/delete controls**, and **no account-only metadata**.
- Add `noindex, nofollow` metadata/headers to public-share views as a best-effort safeguard. A share URL is public to anyone who has it; it is **not** password protected.

## 4. AI model selection and fallback

### Recommended, configured general-chat sequence

| Priority | Model ID | Use |
|---|---|---|
| 1 | `cohere/north-mini-code:free` | Primary, as requested; code-focused |
| 2 | `google/gemma-4-26b-a4b-it:free` | General conversational fallback |
| 3 | `nvidia/nemotron-3-nano-30b-a3b:free` | Suggested third conversational fallback |

**Important correction:** `nvidia/nemotron-3.5-content-safety:free` is a moderation/classification model and should **not** be part of the response-generation fallback chain. It can be evaluated separately if moderation becomes a later requirement. The model IDs above were found on OpenRouter in October 2026, but live availability, provider routing, pricing and limits can change.

### Fallback policy (must be implemented and tested)

1. Before trying a model, validate that the request fits the app's supported content and context size.
2. Try candidates in configured order. If a candidate returns a provider outage, upstream 5xx, temporary routing error, timeout, or 429 **before any output is committed to the client**, try the next candidate.
3. If the model is not found/unsupported, log a configuration failure and continue to the next candidate. Do **not** retry malformed input, authentication failures or invalid API-key errors blindly.
4. **Once any assistant text has been sent to the client, never silently switch models mid-answer.** If it then fails, mark the assistant message failed/incomplete and show Retry. This avoids mixing outputs from multiple models.
5. Each candidate is attempted at most once per request. Bound per-candidate time-to-first-token and total request duration; propagate client cancellation upstream.
6. If all candidates fail before output, return a clean error, no fabricated answer, and a Retry option.
7. Persist/log the selected model and a non-sensitive failure category for debugging. Never log OpenRouter keys or full private prompts by default.
8. Run a lightweight availability/smoke check during setup and before demo day; do not hardcode that free models will always be available.

**Free-tier reality:** OpenRouter free model endpoints are rate limited (its published free-tier guidance currently states 20 requests/minute and 50 requests/day for standard free access, with different quotas for qualifying funded accounts). Failed fallback attempts can consume quota too. Add a configurable per-account app usage limit and a friendly quota-exhausted error; these are demo defaults, not guarantees about OpenRouter's limits.

### Content conversion rules

- Canonical stored format: **TipTap JSON**, not HTML. `contentJson` is authoritative.
- User message: editor JSON → validate allowed nodes/marks → extract model-facing text → save JSON and derived text.
- AI response: streamed **text** → optional Markdown rendering during streaming (safely) → on completion convert Markdown/text to a **restricted TipTap JSON** document → save JSON and derived text.
- Render stored JSON using a read-only TipTap view or `@tiptap/static-renderer`; ensure the frontend and server use the same allowed extensions.
- Keep fenced code, paragraphs, lists, links and text formatting. Strip/escape raw HTML from model outputs; sanitize links (`http:`, `https:` only) and prohibit scripts, inline event handlers, arbitrary embeds and unsafe nodes.
- If conversion fails, preserve the assistant's plain text in a valid paragraph-only TipTap document; never discard a successful answer just because Markdown conversion failed.
- Avoid saving rendered HTML as a second source of truth.

## 5. Screen and route map

| Browser route | Access | Content |
|---|---|---|
| `/login` | Guest | Email/password login form |
| `/signup` | Guest | Name/email/password sign-up form |
| `/chats` | Authenticated | Sidebar, welcome/empty state, New chat |
| `/chats/:chatId` | Owner | Conversation history, TipTap composer, generation state, title, sharing controls |
| `/shared/:token` | Everyone | Read-only shared snapshot or Not Found |
| `*` | Everyone | Not Found |

**UI notes:** responsive sidebar, distinct styling for human and AI messages, accessible keyboard navigation, focus indicators, loading skeletons/indicators, empty states, error toasts, and explicit confirm dialogs for destructive actions. Use readable width for long replies and prevent code blocks from breaking mobile layouts.

## 6. Data model

Use one PostgreSQL database. Let the Better Auth CLI generate its required `User`, `Session`, `Account` and `Verification` models; **do not hand-write or overwrite its internals**. Add these application-level entities (field names are descriptive; finalize in Prisma schema):

### `Chat`

| Field | Type | Constraint |
|---|---|---|
| `id` | UUID | Primary key |
| `userId` | String | FK → Better Auth `User.id`, indexed |
| `title` | String | Required, max 100 chars |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Updated on rename/new message |

### `Message`

| Field | Type | Constraint |
|---|---|---|
| `id` | UUID | Primary key |
| `chatId` | UUID | FK → Chat, indexed, on-delete cascade |
| `role` | Enum | `USER` / `ASSISTANT` only |
| `sequence` | Integer | Position in chat; unique per chat |
| `contentJson` | JSONB / Prisma `Json` | Valid TipTap JSON; nullable until assistant finishes |
| `plainText` | Text | Derived representation; empty while pending |
| `status` | Enum | `PENDING`, `COMPLETED`, `FAILED` |
| `modelId` | String? | Assistant model, nullable for user messages |
| `clientMessageId` | String? | Stable idempotency key on user messages; unique per chat when present |
| `createdAt` | DateTime | Creation timestamp |
| `updatedAt` | DateTime | Completion/status changes |

### `ShareLink`

| Field | Type | Constraint |
|---|---|---|
| `id` | UUID | Primary key |
| `chatId` | UUID | FK → Chat, unique (one link record per chat), on-delete cascade |
| `token` | String | Cryptographically random, unique; treat as a bearer secret |
| `snapshotJson` | JSONB / Prisma `Json` | `{ title, messages: [{role, contentJson}], sharedAt }` |
| `createdAt` | DateTime | Initial creation |
| `updatedAt` | DateTime | Last regenerated snapshot/token |
| `revokedAt` | DateTime? | `null` means active |

**Relations and indexes:** `User (1) → (N) Chat`, `Chat (1) → (N) Message`, `Chat (1) → (0..1) ShareLink`; indexes on `(userId, updatedAt)` for chats, `(chatId, sequence)` for messages, and unique `ShareLink.token`. Public reads must check `revokedAt IS NULL`. Snapshot data must not change when chat history changes. On re-sharing, replace snapshot and rotate token atomically; on disabling, mark revoked. Do not allow two simultaneous streams for the same chat; make sequence updates transactional.

## 7. HTTP API contract

Base path `/api`. JSON routes accept `Content-Type: application/json` except streaming responses. Use one consistent response envelope for normal requests, for example `{ data: ... }` and `{ error: { code, message } }`. IDs are generated on the server.

| Method | Endpoint | Auth | Intent |
|---|---|---|---|
| `GET` | `/api/health` | Public | Health check; no sensitive configuration |
| `GET` | `/api/ready` | Public | Bounded database connectivity check; 200 ready, generic 503 otherwise |
| `ALL` | `/api/auth/*` | Better Auth | Built-in sign-up, sign-in, sign-out and session endpoints |
| `GET` | `/api/chats` | Required | List own chats; optional cursor/limit |
| `POST` | `/api/chats` | Required | Create chat; optional initial title |
| `GET` | `/api/chats/:chatId` | Owner | Chat metadata and ordered messages |
| `PATCH` | `/api/chats/:chatId` | Owner | Rename: `{ "title": "..." }` |
| `DELETE` | `/api/chats/:chatId` | Owner | Delete own chat and children |
| `POST` | `/api/chats/:chatId/messages/stream` | Owner | Add user message, stream AI answer |
| `GET` | `/api/chats/:chatId/share` | Owner | Current sharing state and URL if active |
| `POST` | `/api/chats/:chatId/share` | Owner | Create/refresh snapshot; rotate token, return URL |
| `DELETE` | `/api/chats/:chatId/share` | Owner | Revoke share URL |
| `GET` | `/api/shared/:token` | Public | Read active snapshot only |

**Example streaming request:**

```json
{
  "clientMessageId": "f1e01325-3b6e-4fab-8578-c5c9fd7ca410",
  "contentJson": {
    "type": "doc",
    "content": [
      {
        "type": "paragraph",
        "content": [{ "type": "text", "text": "Explain React useMemo." }]
      }
    ]
  }
}
```

**Streaming response:** use the documented **AI SDK UI Message Stream** protocol for the installed SDK version, not a custom ad-hoc JSON stream, so that `useChat` can consume it. Configure `DefaultChatTransport` / request preparation or a small compatible transport adapter to submit the chat ID and TipTap JSON rather than trusting full client-supplied conversation history. For Express use the SDK's Node response piping helper. Include completion/failure state and model metadata in a version-compatible manner.

**Server is authoritative:** it loads existing history from PostgreSQL based on the authenticated user and chat ID. It must **not** accept an arbitrary list of historical system/user/assistant messages from the browser as trusted context.

**Status semantics:**

- `400` invalid input; `401` missing session; `403` for forbidden actions when appropriate.
- `404` unknown/non-owned chat or invalid/revoked public token (prefer `404` for non-owned resources to avoid leaking existence).
- `409` concurrent generation or invalid retry state; `429` app-level rate limit.
- `502`/`503` upstream service unavailable; `500` unexpected internal error.
- Stream failures after HTTP headers are sent must be reported **within the stream**, as the status code cannot then be changed.

**Idempotency:** for an already completed `clientMessageId`, do not create another user message or re-run model generation. For a retryable failed attempt with the same ID, reuse the existing user message and replace/retry only the assistant attempt. For an in-progress duplicate, return `409`. Persist user message and an assistant placeholder before generation; finalize assistant status/content in a database transaction. On crash/disconnect, mark abandoned `PENDING` assistant messages `FAILED` via simple startup recovery or bounded stale-status cleanup.

## 8. Backend workflow for a send

1. Check session with Better Auth and ensure `chat.userId === session.user.id`.
2. Validate payload with Zod; enforce max length and allowed TipTap JSON structure.
3. Acquire a per-chat generation guard (use database state/transaction so it works beyond one Node process). Reject conflicting generation.
4. Insert user message and pending assistant placeholder; deduplicate by `clientMessageId`.
5. Load up to **20 most recent completed messages** (or another configurable safe context bound), preserving roles and order; strip unauthorized data and construct a bounded model prompt.
6. Iterate configured OpenRouter models using the pre-first-token fallback policy in §4.
7. Pipe AI SDK message chunks to client; on successful completion, convert to safe TipTap JSON, persist final text + actual model ID, and mark `COMPLETED`.
8. On cancellation or upstream error after partial output, mark `FAILED` (never `COMPLETED`), persist only clearly labeled partial output if desired, and release the guard. Ensure a Retry action does not duplicate the user prompt.
9. Update `Chat.updatedAt`; send a final completion signal so the UI can refresh authoritative persisted history.

**Suggested default limits:** `MAX_USER_MESSAGE_CHARS=6000`, `MAX_HISTORY_MESSAGES=20`, `MAX_AI_OUTPUT_TOKENS=1024`, `MAX_GENERATIONS_PER_USER_DAY=15` (application budget only), `MAX_CONCURRENT_GENERATIONS_PER_CHAT=1`, `AI_FIRST_TOKEN_TIMEOUT_MS=15000`. Make these configurable and tune them after testing real free-model behavior.

## 9. Authentication, privacy and security requirements

- Configure Better Auth with Prisma PostgreSQL adapter and persistent database-backed sessions. Prefer secure, httpOnly, SameSite session cookies; use HTTPS in deployment.
- Mount Better Auth's Express handler **before** `express.json()` (per its documented integration). Express 5 catch-all routing differs from Express 4; follow the applicable syntax.
- On cross-origin development/deployment, configure a strict allowlist `CORS_ORIGIN`, credentialed requests and corresponding Better Auth trusted origins. Never combine credentialed requests with wildcard origins.
- Use Better Auth's session API on every protected request. Do not trust owner IDs supplied by the frontend.
- Ensure CSRF protections/origin checks on cookie-authenticated mutations. Keep secrets in server environment variables and `.env` out of Git.
- Limit login attempts, account creation and AI generation (per IP and/or user). Rate-limit public share endpoint to reduce token guessing.
- Validate structured input, its nesting/depth/size and URL schemes; render only allowlisted rich text. Escape untrusted model outputs to prevent XSS. Do not render raw HTML directly.
- Set `Cache-Control: no-store` on private endpoints and public shares. Avoid logging plaintext conversation data unless explicitly enabled for local debugging.
- Public snapshot warning: any person with a share URL can read it. Disable revokes access on new requests; previously downloaded/copied content cannot be recalled.
- No email ownership verification in demo: accounts may be created using unverified addresses. Do **not** describe this configuration as suitable for a real user-facing production deployment.
- Public paths expose the share content only, never email, owner ID, auth tokens, system prompts, credentials or internal error traces.

## 10. Project layout

A simple two-app repository is sufficient. Avoid overengineering with a microservice architecture or message queue.

```text
chat-app/
├── client/
│   ├── src/
│   │   ├── app/                 # routes, providers
│   │   ├── components/          # ChatSidebar, MessageList, Composer, ShareDialog
│   │   ├── features/auth/
│   │   ├── features/chats/
│   │   ├── features/sharing/
│   │   ├── lib/                 # API client, auth client
│   │   └── styles/
│   └── package.json
├── server/
│   ├── prisma/                 # schema.prisma, migrations
│   ├── src/
│   │   ├── index.ts            # Express bootstrap
│   │   ├── lib/                # Prisma, Better Auth, OpenRouter
│   │   ├── middleware/         # requireSession, error handling, rate limits
│   │   ├── modules/chats/      # routes, services, repository, validation
│   │   ├── modules/ai/         # prompt building, fallback, streaming, conversion
│   │   ├── modules/sharing/    # snapshot lifecycle and public read
│   │   └── tests/
│   ├── .env.example
│   └── package.json
├── AGENTS.md
├── README.md
└── SPEC.md
```

Avoid importing Prisma/Better Auth server modules into the React frontend. Keep minimal API contract types close to each consumer, or add a small shared package only when duplication becomes painful.

## 11. Environment variables

Set these server values in the private `server/.env` (copy `server/.env.example` to start); use `OPENROUTER_API_KEY` as the sole OpenRouter key variable. Set real values locally/at deployment, **never** include actual API keys in Git.

```dotenv
# Server-only
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/chat_app"
BETTER_AUTH_SECRET="replace-with-long-random-secret"
BETTER_AUTH_URL="http://localhost:3001"
OPENROUTER_API_KEY="replace-with-your-openrouter-key"
CLIENT_ORIGIN="http://localhost:5173"
PORT=3001
NODE_ENV=development
TRUST_PROXY_HOPS=0

# Models (ordered)
OPENROUTER_MODEL_1="cohere/north-mini-code:free"
OPENROUTER_MODEL_2="google/gemma-4-26b-a4b-it:free"
OPENROUTER_MODEL_3="nvidia/nemotron-3-nano-30b-a3b:free"

# Application-level demo guardrails
MAX_GENERATIONS_PER_USER_DAY=15
MAX_USER_MESSAGE_CHARS=6000
MAX_HISTORY_MESSAGES=20
MAX_AI_OUTPUT_TOKENS=1024
AI_FIRST_TOKEN_TIMEOUT_MS=15000
AI_TOTAL_TIMEOUT_MS=90000

# Client (non-secret)
VITE_API_BASE_URL="http://localhost:3001/api"
```

Choose the actual Better Auth base URL, trusted origins and cookie settings consistently with how the client and API are hosted. On local development, both applications may run on different ports; on production, a same-site reverse proxy (`/api` → Express) can simplify cookie handling.

The selected demo topology uses the default Vercel/Render domains and a same-origin `/api` proxy before the Vercel SPA fallback. Both server auth/origin URLs point to the stable Vercel origin. Render's free web service runs Prisma migrations at startup and uses `/api/ready` as its health check; the separate free PostgreSQL database expires after 30 days. `TRUST_PROXY_HOPS` defaults to 0 for local direct access; configure a verified bounded proxy chain in hosting. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for settings and verification. Local checks and deployment files do not establish that a live deployment has been verified.

## 12. Delivery plan

**Phase 1 — Skeleton & persistence:** React/Vite, Express/TypeScript, PostgreSQL/Prisma, migrations, validation, health endpoint, and local setup instructions.

**Phase 2 — Authentication & ownership:** Better Auth sign-up/login/session/logout; protected chat CRUD; authorization tests.

**Phase 3 — AI chat:** TipTap composer, saved messages, SDK streaming, model fallback and error handling; UI loading/stop/retry.

**Phase 4 — Sharing:** public snapshot/token lifecycle, share page, revoke/rotate, privacy warnings and access-control tests.

**Phase 5 — Quality:** responsive styling, accessibility, error/empty states, security checks, end-to-end smoke tests and deployment.

## 13. Definition of done and acceptance tests

| ID | Acceptance condition |
|---|---|
| A01 | New user signs up with email/password/name and can sign in/out; state survives page reload |
| A02 | Logged-out user cannot list, create, modify or delete private chats |
| A03 | User A never sees User B's chats/messages or operates on B's links through owner endpoints |
| A04 | User creates multiple chats, renames them, reloads browser and sees correct persisted titles |
| A05 | User deletes a chat; its messages and public share no longer exist |
| A06 | TipTap formatting is persisted as JSON and appears correctly after refresh; no unsafe HTML executes |
| A07 | AI reply appears incrementally; successful answer remains visible after reload |
| A08 | Backend sends only server-loaded, bounded chat history to the AI provider |
| A09 | Simulated primary failure before first chunk triggers second; second failure triggers third |
| A10 | Failure after partial streaming does not append a second model's output to the same answer |
| A11 | Stop/cancel or provider outage displays meaningful state and supports safe retry without duplicate user messages |
| A12 | Creating a share URL enables unauthenticated, read-only access to a fixed snapshot |
| A13 | Adding new private messages does **not** alter the previously shared snapshot |
| A14 | Refreshing a public share snapshot revokes its old link; disabling link makes API return 404 |
| A15 | Guessing another chat ID or using a revoked share token cannot expose private data |
| A16 | Missing/invalid OpenRouter key, quota exhaustion and all-model failure fail gracefully without leaked secrets |
| A17 | README documents setup, migrations, environment variables, tests and known demo limitations |

**Minimum test suite:** backend integration tests for protected routes, ownership, chat CRUD, share-token lifecycle; mocked provider tests for each fallback boundary and partial-stream errors; UI tests for auth states, composer and share view. Add one manual end-to-end flow using a real OpenRouter key.

## 14. Explicitly out of scope for MVP

- Password recovery, email verification, emails, OAuth/social login and profile management.
- Team workspaces, collaboration, multiple chat participants, chat search, folders, pinned chats.
- Editing or deleting individual sent messages, regenerating earlier turns, branching conversations.
- Attachments, image/audio/video input, voice, image generation, model picker and user-provided keys.
- RAG/vector database, embeddings, web search, external tools, agents and scheduled jobs.
- Billing, subscriptions, paid models, analytics dashboard, export/import and advanced moderation.
- Live updating a publicly shared chat: sharing always uses an explicitly refreshed snapshot.

## 15. Open decisions / change requests (non-blocking)

This specification picks sensible defaults; change them before development only if product expectations differ:

1. **Shared content: snapshot vs live.** Default: snapshot (safer; prevents silently exposing future messages).
2. **Meaning of edit.** Default: rename chat only; editing previously submitted prompts deferred.
3. **Assistant formatting.** Default: free-form Markdown safely converted to TipTap JSON after streaming, rather than expecting the AI to produce TipTap JSON directly.
4. **First model.** Default: Cohere North Mini Code because it was requested; for general conversation quality, Gemma may make a better primary after a short side-by-side test.
5. **Deployment hosts.** Selected: Vercel for the static SPA, free Render for the Express API and a separate free PostgreSQL database. Default hosting domains use a same-origin `/api` proxy for cookie sessions. Free database expiry and idle API startup delays are accepted demo limitations.

---

## 16. Reference links (verified while drafting)

- Better Auth — Express integration: https://better-auth.com/docs/integrations/express
- Better Auth — Prisma adapter: https://better-auth.com/docs/adapters/prisma
- Better Auth — email/password: https://better-auth.com/docs/basic-usage
- AI SDK — Express streaming cookbook: https://ai-sdk.dev/cookbook/api-servers/express
- AI SDK — `useChat`: https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat
- Official OpenRouter AI SDK provider: https://github.com/OpenRouterTeam/ai-sdk-provider
- TipTap static renderer: https://tiptap.dev/docs/editor/api/utilities/static-renderer
- OpenRouter free-model limits: https://openrouter.ai/collections/free-models
- Cohere North Mini Code: https://openrouter.ai/cohere/north-mini-code:free
- Google Gemma 4 26B A4B IT: https://openrouter.ai/google/gemma-4-26b-a4b-it:free
- NVIDIA Nemotron 3 Nano 30B A3B: https://openrouter.ai/nvidia/nemotron-3-nano-30b-a3b:free
- NVIDIA Content Safety (moderation only): https://openrouter.ai/nvidia/nemotron-3.5-content-safety:free

**Handoff instruction to implementers:** Treat sections 1–13 as the MVP contract. Use official current SDK/provider documentation when writing implementation code; third-party APIs may evolve. Flag deviations from the explicitly documented assumptions in a PR, rather than silently adding features.
