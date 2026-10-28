---
name: react-tailwind
description: Build, refactor, or review React and Tailwind UI in the Chat App, including shared components, responsive layouts, accessible interactions, and visual states. Use for frontend presentation and interaction work, not backend-only or general TypeScript cleanup tasks.
---

# React and Tailwind

Use [AGENTS.md](../../../AGENTS.md) for shared conventions and [SPEC.md](../../../SPEC.md) for required behavior. This skill adds UI implementation guidance without changing the product scope or design system.

## Inspect before editing

- Read the affected route/component, its state owners, callers, tests, and relevant styles. Check installed React, Router, TipTap, and Tailwind versions before selecting APIs.
- Inspect `client/src/styles/index.css`, `preview.css`, and their import order. The project uses Tailwind v4 through the Vite plugin, CSS `@theme` tokens, and shared component classes. Extend these conventions; do not introduce a legacy v3 configuration or migrate existing CSS merely to standardize style.
- Identify the required loading, empty, disabled, success, and error states for the requested interaction. Preserve current Thread branding unless the user requests a redesign.

## Implement the smallest coherent change

- Keep local interaction state near its owner and derive values when possible. Use effects for external synchronization, with cleanup for subscriptions/timers; check behavior under StrictMode, route changes, and late async results. Extract hooks or components when responsibilities or reuse justify them, not for every fragment.
- Reuse existing controls, dialogs, message rendering, and service boundaries. UI state must reflect the real session or generation state rather than a second, independently updated copy. Keep preview-only behavior distinguishable from real services.
- Use Tailwind utilities for suitable local layout/spacing and shared CSS/tokens for existing component patterns. Keep variant classes statically discoverable; avoid constructing fragments such as `bg-${color}` that the build cannot detect. Avoid competing overrides across stylesheets.
- Use semantic controls and real labels, meaningful accessible names, visible focus, and keyboard-operable interactions. Preserve focus when opening/closing dialogs and mobile navigation. Announce important status/error changes without announcing every streamed token.
- Test layout pressure with long chat titles, rich text, code blocks, validation errors, and narrow screens. Prevent horizontal page overflow while preserving code-block scrolling and usable touch targets.
- When touching the composer, preserve its structured JSON interface, editor selection, composition events, and send/stop state. Use existing safe rendering rather than injecting HTML.

## Verify and report

- For meaningful interaction changes, run focused React Testing Library tests and the existing build script; use configured linting if available. For visual-only changes, prioritize browser inspection over tests that merely assert class names.
- Check representative desktop/mobile layouts, keyboard focus, and overflow with available browser tooling. jsdom tests do not verify layout or native browser dialog behavior. Report unavailable visual verification accurately.
- Report the behavior changed, relevant checks and results, and remaining limitations. For a review-only request, return findings and proposed improvements without editing code.
