# TESTING
_Last updated: 2026-06-07_

## Summary
There are no tests in this codebase. No test files (`*.test.*`, `*.spec.*`) were found anywhere. No test framework (Vitest, Jest, Mocha, etc.) is installed and no test scripts exist in `package.json`. The only automated code quality check is TypeScript strict-mode typechecking.

## Test Framework

**Runner:** None installed.

**Assertion Library:** None.

**Run Commands:**
```bash
# Typecheck only — the sole automated quality gate
npm run typecheck
# expands to:
tsc -p server/tsconfig.json --noEmit && tsc -p client/tsconfig.json --noEmit
```

There is no `test` script in `package.json`.

## Test File Organization

**Test files found:** 0

```bash
find . -name "*.test.*" -o -name "*.spec.*"
# (no output)
```

## What Is and Isn't Tested

**Tested:** Nothing. There is no automated test coverage.

**Untested areas of note:**

- `shared/types.ts` — `maxPicks()` function: pure function with clear boundary cases (0, 1, 2, 3, 4+ arguments); highest-value unit test candidate
- `server/src/validate.ts` — `cleanText`, `cleanName`, `cleanCode`, `cleanRestaurantName`, `cleanDecisionTopic`: pure input-sanitization functions; straightforward to unit test
- `server/src/rooms.ts` — room lifecycle (create, join, phase transitions, scoring): core game state machine; integration test candidate
- `server/src/flow.ts` — phase auto-advance and bot behavior: timer-driven logic with side effects
- `server/src/socket.ts` — Socket.IO event handlers: require mock socket setup
- `server/src/services/aiService.ts` — LLM integration with mock fallback: `USE_MOCKS` flag makes offline testing feasible
- `server/src/services/placesService.ts` — Google Places API wrapper: external API with mock mode

## Coverage

**Requirements:** None enforced.

**Coverage tooling:** None installed.

## Mock Infrastructure

There is a built-in mock system for external services controlled via environment variables, but it is for development/production fallback — not for tests:

- `USE_MOCKS=true` (or when `LLM_API_KEY` is absent) → `aiService.ts` returns hardcoded `MOCK_SWIPE_CARDS` and template questions without calling the LLM
- The same pattern exists in `placesService.ts` for Google Places API calls
- This infrastructure could be reused as the basis for unit tests of server logic

## If Tests Were Added

**Recommended framework:** Vitest (matches project preference from user config).

**Install:**
```bash
bun add -d vitest
```

**Suggested test locations:**
- `shared/types.test.ts` — `maxPicks()` edge cases
- `server/src/validate.test.ts` — all `clean*` helpers
- `server/src/rooms.test.ts` — room creation, join, phase transitions
- `client/src/lib/identity.test.ts` — localStorage-backed identity helpers

**Suggested `package.json` scripts to add:**
```json
"test": "vitest run",
"test:watch": "vitest"
```
