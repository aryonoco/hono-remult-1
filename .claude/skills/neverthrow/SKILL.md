---
name: neverthrow
description: "neverthrow 8.x Result<T,E> and ResultAsync<T,E> — constructors, combinators (map, mapErr, andThen, safeTry, match), fromPromise, side effects (andTee, orTee). Use when writing TypeScript that imports from 'neverthrow'."
user-invocable: false
---

# neverthrow API Reference

Rust/OCaml-style error handling for TypeScript. Use `Result<T, E>` for synchronous
and `ResultAsync<T, E>` for asynchronous operations. Never throw for expected errors.

## Current Version

!`grep -o '"neverthrow": "[^"]*"' package.json 2>/dev/null || echo "neverthrow version not found"`

## References

- [API reference](api-reference.md) — all constructors, combinators, type signatures
- [Common mistakes](common-mistakes.md) — 8 anti-patterns with corrections
- [Remult integration](remult-integration.md) — wrapping repo calls, error types, signal patterns
- [Full neverthrow docs](llms-full.txt) — README, wiki, type definitions, changelog

When the quick reference is insufficient, read `llms-full.txt` for the authoritative API.

## Decision Trees

### Which constructor?

| Scenario | Constructor |
|----------|------------|
| Wrapping a Promise | `ResultAsync.fromPromise(promise, errorMapper)` |
| Wrapping sync throwing fn | `Result.fromThrowable(fn, errorMapper)()` |
| Wrapping async throwing fn | `ResultAsync.fromThrowable(fn, errorMapper)()` |
| Promise that won't reject | `ResultAsync.fromSafePromise(promise)` |
| Known success value | `ok(value)` / `okAsync(value)` |
| Known error value | `err(error)` / `errAsync(error)` |
| Returning void | `ok()` / `err()` (v8.2.0) |

### Which combinator?

| Intent | Combinator |
|--------|-----------|
| Transform success value | `.map(fn)` |
| Transform error value | `.mapErr(fn)` |
| Chain fallible sync op | `.andThen(fn)` |
| Chain fallible async op | `.asyncAndThen(fn)` |
| Side effect on success (preserve value) | `.andTee(fn)` |
| Side effect on error (preserve error) | `.orTee(fn)` (v8.2.0) |
| Fallible side effect on success | `.andThrough(fn)` |
| Recover from error | `.orElse(fn)` |
| Multi-step happy path | `safeTry(function* () { yield* ... })` |
| Extract final value | `.match(ok, err)` or `.unwrapOr(default)` |

### Combining multiple Results?

| Behaviour | Function |
|-----------|----------|
| Short-circuit on first error | `Result.combine([...])` |
| Collect ALL errors | `Result.combineWithAllErrors([...])` |

## Critical: v8.0 Breaking Change

`orElse` type parameters changed from `<ErrType>` to `<OkType, ErrType>`.
Type inference handles this automatically in most cases.

## ESLint Enforcement

The `@bufferings/eslint-plugin-neverthrow` `must-use-result` rule ensures every
`Result` / `ResultAsync` is consumed. Unhandled Results are compile errors.
