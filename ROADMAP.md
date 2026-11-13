# Chat App roadmap

## Current status and priorities

- Delivered: the six frontend routes/layouts, accessible controls, and isolated interactive UI preview described below.
- Delivered: Better Auth email/password sign-up/sign-in/sign-out; PostgreSQL/Prisma sessions; Express 5 session/ownership guards; persistent empty-chat CRUD; migrations and setup instructions.
- Authentication intentionally has no email verification, recovery email, OAuth, or user-supplied API keys, per SPEC.md.
- Verification: client auth flows and session recovery tests, server HTTP/config checks, and real PostgreSQL integration coverage for hashing, cookies, expiry/revocation, origin checks, rate limiting, and ownership.
- Delivered: stored messages, AI SDK 7/OpenRouter streaming, bounded pre-content fallback, cancellation, safe Markdown conversion, idempotent replay/retry, database concurrency guards and account usage limits (SPEC.md phase 3).
- Delivered: Thread, ELI5, and Coach answer styles for real sends/retries, with server-controlled prompts and an allowlisted per-request persona. Style selection resets on refresh; the UI preview retains fixed sample responses.
- Delivered: context budgeting with pinned native tokenizers and published chat templates for all three default models, counting and trimming separately per fallback while reserving output and upstream formatting headroom. Cold tokenizer loads require public Hugging Face access; local counts may differ from upstream billing counts.
- November 13 fix: cold tokenizer downloads allow sixty seconds within the total request deadline, independently of the provider first-token timer. Replaced the retired Nano free fallback with Nemotron 3.5 Lightning free; verified all three native tokenizers and one live primary reply. Server regression tests and TypeScript passed; no browser or database integration suite was run for this fix.
- Implemented: private PostgreSQL rolling summaries when token or history bounds require compression, with one bounded extra primary-model call, saved sequence tracking, original-message preservation and guarded trimming on summary failure. Includes unit coverage and prepared PostgreSQL integration coverage; requires the conversation-summary migration before use.
- Verification: provider failure/timeout/cancellation tests, real PostgreSQL message lifecycle and disconnect tests, React SDK streaming tests, and a bounded live primary-model browser check including refresh persistence and mobile rendering.
- Next: implement durable public snapshot/token lifecycle and its access-control tests (phase 4), followed by remaining deployment and end-to-end checks (phase 5).
- Delivered: [live Vercel demo](https://thread-chat-lovat.vercel.app), free Render API, Neon production PostgreSQL, same-origin API proxy and [deployment instructions](docs/DEPLOYMENT.md). Review fixes add verified per-visitor auth identities, origin protection, Stop after refreshing a pending chat, and explicit no-store streaming headers. The November 4 Neon migration preserved existing records, kept local data separate and passed live browser authentication, persistence and streaming checks. The old Render database is a read-only recovery copy until its November 30, 2026 expiry. Durable sharing and wider production hardening remain future work.

## Delivered frontend plan (historical phase scope)

The plan below records the original frontend-only phase. Its backend exclusions do not apply to the completed authentication work above or to future explicitly requested backend tasks.

## Summary

The frontend phase preserved the Thread design, React/Vite stack, and six specified routes and added clearly labeled preview generation, stopping, and retrying. Backend services were outside that phase.

## Page and layout changes

- Preserve the shared authentication layout, protected chat workspace, public snapshot layout, and Not Found page.
- Complete loading, empty, unavailable, and recoverable error states. Disable conversation actions and submission while chat details are loading.
- Add consistent document titles and an accessible route error fallback with a reload action.
- Retain responsive navigation, keyboard focus indicators, destructive-action confirmations, safe rich-text rendering, and horizontally scrolling code blocks.
- Keep public snapshots free of composers, generation controls, account metadata, and owner actions.

## Interactive preview and component interfaces

- Extend the in-memory preview service with a separate `PreviewChatService` interface providing chat subscriptions, stable chat snapshots, `send`, `retry`, and `stop`. Keep the production `ChatService` and HTTP contracts unchanged.
- Track generation per chat. Navigation between chats preserves active preview generation; leaving preview cancels timers and clears preview data.
- Add a preview-only response selector to the existing preview banner: **Normal**, **Fail before response**, and **Fail during response**. Default to Normal and capture the selected outcome when sending begins.
- On send, immediately append one completed user message and one pending assistant placeholder. Reveal a fixed, explicitly labeled sample response in word groups every 250 ms after a 400 ms initial delay. No model or external service is invoked.
- Failure before response leaves an empty failed assistant message. Failure during response stops halfway and preserves visibly incomplete content.
- Stop cancels further updates, preserves partial content, and displays “Generation stopped.” Retry reuses the original user message and assistant placeholder, clears the partial response, and uses the currently selected preview outcome.
- Extend the composer with externally controlled `disabled`, `generating`, and `onStop` props. Show **Stop generation** during generation and prevent concurrent sends in that chat. Preserve formatting, message limits, Enter submission, Shift+Enter, and IME handling.
- Add optional retry callbacks to private message rendering. Shared rendering receives no action callbacks.
- Sending from `/chats` creates a preview chat and opens its conversation. Outside preview, retain the explanatory unavailable state and preserve the draft.
- Continue snapshotting only completed messages; subsequent preview messages never change an existing snapshot.

## Verification

- Test optimistic messages, progressive updates, both failure modes, cancellation, retry without duplicated prompts, and same-chat send blocking using fake timers.
- Test generation across chat navigation and cleanup when leaving preview.
- Verify all routes, guest redirects, loading/error recovery, mobile drawer focus and Escape behavior, and destructive-action confirmation.
- Verify shared snapshots remain fixed and expose no private controls, including Stop and Retry.
- Retain rich-text safety and composer keyboard tests. Run the production build and complete test suite.
- Check desktop and mobile layouts in a browser when available; report any unavailable visual verification.

## Assumptions and delivery

- Preserve current branding and styling; this is a completion pass.
- Preview data remains memory-only and resets on refresh.
- Do not add backend authentication, persistence, AI SDK transport, OpenRouter integration, or deployment.
- Update the README to explain the preview scenarios, completed UI states, and remaining backend work.
