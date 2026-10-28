---
name: typescript-quality
description: Implement, refactor, and review TypeScript and TSX in the Chat App when a task involves typed application logic, compiler errors, unsafe data boundaries, or type-safety and maintainability concerns. Use for focused TypeScript quality work, not styling-only or documentation-only changes.
---

# TypeScript quality

Apply [AGENTS.md](../../../AGENTS.md) for shared project rules and [SPEC.md](../../../SPEC.md) for contracts. This skill adds a TypeScript inspection workflow; it does not authorize unrelated refactors or changes to project architecture.

## 1. Inspect the affected code

- Read the implementation, callers, tests, applicable `tsconfig` files, package scripts, and installed dependency types before proposing changes. Trace values from external input to their consumers.
- Check the installed compiler rather than assuming the latest language features. The current client uses TypeScript 5.9, strict mode, unused-code checks, bundler module resolution, and isolated modules. Strict mode does not guarantee safe array indexing or validate runtime JSON; do not change compiler options merely to silence errors.

## 2. Identify concrete problems

- Prefer inference for local values and straightforward expressions. Add annotations at meaningful boundaries or where they clarify contracts; use `satisfies` when checking a shape should preserve an expression's inferred type.
- Look for explicit or inferred `any`, assertion chains, non-null assertions, unchecked lookups, and misleading generic return types. Prefer guards and control-flow narrowing over assertions; an assertion does not prove an invariant.
- Treat untrusted values as `unknown` until runtime checks establish their shape. A generic helper such as `request<T>`, a cast, or a return annotation does not validate `response.json()`, parsed JSON, form input, or caught errors. Reuse existing validators; distinguish validation from fallback/default behavior.
- Use interfaces or type aliases for clear object contracts, unions for alternatives, and discriminated unions when states have different required data. Use generics only when they preserve a real relationship between inputs and outputs; avoid decorative type parameters and unnecessarily complex type machinery.
- Check nullable/optional fields, exhaustive state handling, async errors, mutation of shared data, and effect/subscription lifetimes. Connect each finding to a failing scenario or maintenance cost, not a stylistic preference.
- Apply Single Responsibility where mixed concerns cause an actual problem. Prefer a small function or hook over adding classes, repositories, factories, or interfaces solely to satisfy SOLID terminology.

## 3. Make the smallest appropriate improvement

- For implementation/refactoring, fix the identified cause while preserving runtime behavior and public contracts unless the task explicitly changes them. Retain TipTap JSON and production/preview service boundaries when touching chat data.
- For review-only requests, report prioritized findings with file/line references, impact, and a minimal suggested fix; do not edit files.
- Do not add dependencies or supporting abstractions just for this workflow. Zod is specified for future backend validation but is not currently a direct client dependency; do not assume it is available or install it automatically. Identify any validation work requiring a separate dependency decision.

## 4. Verify with existing tooling

- Recheck package scripts before running checks. Current root commands: `npm run build` runs `tsc -b` and the client production build; `npm test` runs Vitest. Run relevant checks after code changes, with focused behavior tests for affected paths and malformed boundary data where applicable.
- Run configured lint scripts if present. There is currently no lint script; report that limitation rather than inventing a command or adding a linter. In review-only work, use checks when they help validate a finding and distinguish existing failures from regressions.

## 5. Report the result

Summarize changes or findings, their practical effect, checks actually performed and results, and remaining issues. A successful compiler check does not establish runtime input validity or satisfy the spec's backend acceptance tests.
