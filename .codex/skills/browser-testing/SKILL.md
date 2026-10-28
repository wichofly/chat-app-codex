---
name: browser-testing
description: Verify the Chat App in a real browser for requested end-to-end flows, responsive layouts, keyboard accessibility, session cookies, or UI regressions. Use when browser interaction or rendering evidence is needed; do not substitute component tests for browser verification.
---

# Browser testing

Follow [AGENTS.md](../../../AGENTS.md), [README.md](../../../README.md), and the applicable [SPEC.md](../../../SPEC.md) acceptance criteria. Test only the requested behavior and distinguish browser evidence from mocked or server-only checks.

## Establish the test environment

- Discover available browser-control tools, installed browser-test packages, scripts, and running local servers. Reuse suitable existing infrastructure. Do not assume Playwright, a browser connector, or an end-to-end script exists.
- If browser tooling is unavailable, report that limitation and run useful existing component/HTTP checks where appropriate. Add tooling only when browser-test setup is within the authorized task; do not claim screenshots, cookie behavior, or visual results from jsdom.
- For local UI work, use the URL printed by `npm run dev`; start `npm run dev:server` when the flow needs the API. Check README and environment configuration before testing authentication. Keep hostname/port consistent with cookie and trusted-origin configuration; `localhost` and `127.0.0.1` are not interchangeable for this purpose.
- Verify the page/API is reachable before interaction. Keep track of servers and browser contexts you create; close only resources owned by this test run. Never print private environment values to diagnose setup.

## Exercise relevant behavior

- Choose a short scenario with explicit preconditions, actions, and expected outcomes. Use accessible roles/labels and state-based waits instead of brittle DOM positions or arbitrary sleeps.
- For authentication work, use disposable accounts in a designated test environment. Check guest redirects, successful/failed submission, reload restoration, sign-out, and expiry where relevant. A server cookie assertion alone does not prove that a browser accepts and sends it.
- For UI work, cover representative desktop and mobile widths, keyboard-only navigation, focus restoration, scrolling, and overflow with long content. Inspect console errors and failed requests that affect the scenario.
- For chat work, distinguish UI preview simulation from live AI. Test the applicable generating, Stop, failure, and Retry paths; use deterministic mocks unless the task calls for a live provider smoke test.
- For sharing work, use a fresh unauthenticated browser context and verify read-only content and unavailable/revoked links. Do not infer public access from an owner's authenticated tab.
- Limit mutations to test data you created and can identify. Do not reset a configured database, delete unrelated chats, publish a private conversation, or invoke a live model merely to complete a visual check.

## Capture and report evidence

- Record the tested URL/environment, viewport, scenario outcome, and useful console/network evidence. Capture screenshots or traces when available and useful; avoid capturing passwords, tokens, or unrelated private conversation content.
- Report reproducible failures with steps and expected versus actual results. State when mocks, preview data, or missing services limit the conclusion; unavailable future features are not automatically regressions.
- Leave application code unchanged for testing-only requests. Implement fixes only when requested, then rerun the affected scenario. Report checks not performed and any cleanup that could not be completed.
