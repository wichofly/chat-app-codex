# Complete the base pages and layouts

## Summary

Finish the existing frontend foundation while preserving the current Thread design, React/Vite stack, and six specified routes. Add interactive, clearly labeled preview behavior for generation, stopping, and retrying. Backend services remain outside this task.

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
