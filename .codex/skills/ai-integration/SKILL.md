---
name: ai-integration
description: Implement, debug, or review the Chat App's Vercel AI SDK and OpenRouter chat integration, including streaming transport, fallback boundaries, persisted messages, cancellation, and retry. Use for real model-service integration work, not ordinary prompt writing or preview-only UI changes.
---

# AI integration

Apply [AGENTS.md](../../../AGENTS.md). Read [SPEC.md](../../../SPEC.md) sections 3-4 and 6-9 for the AI contract and [ROADMAP.md](../../../ROADMAP.md) for current implementation scope. Keep model/provider policy in those sources rather than maintaining another model list here.

## Establish the integration boundary

- Inspect the actual server configuration, auth/ownership middleware, Prisma schema, chat services, composer, and transport. Do not mistake the memory-only preview for a real streaming or persistence implementation.
- Check installed `ai`, `@ai-sdk/react`, and `@openrouter/ai-sdk-provider` versions and their Node requirements. Consult Context7 when available or official SDK/provider documentation for version-compatible transport, Express piping, error, and cancellation APIs. If packages are missing, add compatible releases only as part of authorized integration work and update the lockfile.
- Confirm server-side environment variable names and configured model order against the spec. Keep values private. Do not replace the chosen stack or add tools, retrieval, multimodal input, model pickers, or other product features to complete text chat.

## Implement or inspect the send lifecycle

- Trace one request from authenticated owner through validation, idempotency, pending-message creation, bounded server-loaded history, provider output, and final persistence. Handle concurrency in database state rather than relying only on a process-local lock or a disabled Send button.
- Configure request preparation so the SDK's default client history is not treated as authoritative context. Submit the required chat/document/idempotency inputs and use the installed SDK's UI Message Stream protocol instead of an ad-hoc stream format.
- Make the fallback boundary explicit before connecting providers. Follow the spec's qualifying failure categories, attempt limits, and timeouts; ensure a failed candidate cannot leak output into a successful candidate's answer. After partial assistant text, terminate with an incomplete/error state rather than appending another model's response.
- Trace Stop and client disconnect through upstream cancellation, assistant status, guard release, and UI recovery. Retry must reuse the user message and a retryable assistant attempt, not duplicate the prompt. Reconcile completed client output with persisted authoritative history.
- Preserve successful output through restricted TipTap JSON conversion, including the paragraph-only fallback. Persist completion status and the actual model used; keep partial/failed content visibly distinct and excluded from completed shared messages.

## Verify failure boundaries

- Use mocked providers to test primary/secondary failure before content, all-candidate failure, non-retryable input/credential failures, timeout, and failure after partial output. Assert which candidates were called and that outputs were not mixed.
- Test Stop/disconnect, guard release, duplicate/in-progress/completed request IDs, retry without duplicate prompts, and persistence after reload. Cover malformed rich text and unsafe generated markup/links through the real validation/conversion boundary.
- Use existing build, type-checking, and test scripts for affected workspaces. Database tests require a designated test database; do not apply migrations to an unrelated configured database to verify a change.
- Use live credentials only for an authorized, bounded smoke test. Verify current model availability, respect configured usage limits, avoid private prompts, and stop on quota or credential failures rather than repeatedly spending attempts. Mocked success is not proof of live provider availability.
- Report implemented behavior or review findings, checks actually run, observed model/failure information without secrets, and remaining integration gaps. Review-only requests do not authorize code changes or live provider calls.
