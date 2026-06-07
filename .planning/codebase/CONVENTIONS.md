# CONVENTIONS
_Last updated: 2026-06-07_

## Summary
This is a TypeScript monorepo (server + client + shared) using strict TypeScript settings throughout. There is no linter config (no ESLint/Prettier/Biome detected), so style is enforced only by `tsc --strict`. Code is consistently clean, small-function-oriented, and comment-heavy by convention.

## TypeScript Configuration

Both packages use `strict: true` with `ES2022` target and `moduleResolution: Bundler`.

- Server config: `server/tsconfig.json` — targets Node, `lib: ["ES2022"]`
- Client config: `client/tsconfig.json` — targets browser, `lib: ["ES2022", "DOM", "DOM.Iterable"]`, `jsx: "react-jsx"`, `isolatedModules: true`
- Both share `shared/types.ts` via `"include": ["../shared/**/*.ts"]`
- Client has a path alias: `@shared/*` → `../shared/*`
- `noEmit: true` — compilation is type-check only; Vite/tsx handle transpilation
- `skipLibCheck: true`, `forceConsistentCasingInFileNames: true`

**No linter or formatter config detected.** There are no `.eslintrc*`, `.prettierrc*`, or `biome.json` files. Typechecking is the only automated code quality gate:
```bash
tsc -p server/tsconfig.json --noEmit && tsc -p client/tsconfig.json --noEmit
```

## Naming Patterns

**Files:**
- Server: `camelCase.ts` — `rooms.ts`, `socket.ts`, `validate.ts`, `flow.ts`
- Server services: `camelCase.ts` — `aiService.ts`, `placesService.ts`
- Client screens: `PascalCase.tsx` — `Home.tsx`, `Voting.tsx`, `Lobby.tsx`
- Client components: `PascalCase.tsx` — `Button.tsx`, `ConnBadge.tsx`, `SwipeDeck.tsx`
- Client lib: `camelCase.ts/tsx` — `socket.tsx`, `identity.ts`, `geo.ts`
- Client UI barrel: `index.ts` (re-exports all UI components)

**Functions:**
- Regular functions: `camelCase` — `createRoom`, `cleanText`, `makeCode`, `broadcast`
- React components: `PascalCase` named exports — `export function Button(...)`, `export function Home()`
- React hooks: `useX` prefix — `useGame`, `useMe`, `useToast`
- Event handlers: verb-first camelCase — `toggle`, `submit`, `create`, `join`

**Variables:**
- `camelCase` throughout
- Constants: `UPPER_SNAKE_CASE` for module-level constants — `TOTAL_ROUNDS`, `ALPHABET`, `BOT_ANSWERS`, `MOCK_SWIPE_CARDS`, `RANK_LABELS`
- Regex patterns: `UPPER_SNAKE_CASE` — `CONTROL_CHARS`, `CODE_RE`

**Types and Interfaces:**
- Exported domain types: `PascalCase` interfaces/types — `Restaurant`, `RoomView`, `PlayerView`, `SwipeCard`
- Internal (non-exported) types: `PascalCase` — `Player`, `Room`, `PhaseTimer`, `Mode`
- Type aliases for unions: `PascalCase` type — `Phase`, `ButtonVariant`, `ButtonSize`
- Request payloads: `PascalCase` + `Req` suffix — `CreateRoomReq`, `JoinRoomReq`, `SetDecisionTopicReq`
- Generic acknowledgement wrapper: `Ack<T>` in `shared/types.ts`

## Import Organization

**Pattern (observed in client screens and components):**

1. React and external packages first
2. Internal aliases (`@shared/...`) and lib imports
3. Component imports (hooks, context providers)
4. Local relative imports (layout, ui components)

Example from `client/src/screens/Voting.tsx`:
```ts
import { useMemo, useState } from 'react';
import { Vote, Check } from 'lucide-react';
import { motion as Motion } from 'motion/react';
import { maxPicks } from '@shared/types.ts';
import { useGame, useMe } from '../lib/socket.tsx';
import { useToast } from '../components/Toast.tsx';
import { WaitingFor } from '../components/WaitingFor.tsx';
import { Screen } from '../components/layout/Screen.tsx';
import { Button } from '../components/ui';
import { Countdown } from '../components/Countdown.tsx';
```

**Path aliases:**
- `@shared/*` resolves to `../shared/*` (client only, configured in `client/tsconfig.json`)
- Server uses relative imports: `../../shared/types.ts`

**Import style:**
- Always use `import type { ... }` for type-only imports (consistently followed)
- Named imports only — no default imports from application code
- `motion as Motion` alias used throughout for Framer Motion

## Code Style

**Module system:** ESM throughout (`"type": "module"` in `package.json`). All imports use `.ts`/`.tsx` extensions explicitly.

**Function style:**
- Regular `function` declarations for top-level and React components
- Arrow functions for inline callbacks, constants, and short helpers
- `async function` for async event handlers in React screens; `async` arrow functions in socket handlers
- Short guard-and-return early exits preferred over deep nesting

**Pattern — guard returns:**
```ts
if (!name) return cb(fail('Name required'));
if (!code) return cb(fail('Enter a 4-letter room code'));
```

**Pattern — ok/fail helpers in socket.ts:**
```ts
const ok = <T>(data?: T): Ack<T> => ({ ok: true, data });
const fail = (error: string): Ack => ({ ok: false, error });
```

**Object construction:** Inline object literals with explicit property names; no shorthand-only style enforced but shorthand used where natural.

**Error handling pattern (server socket handlers):**
```ts
try {
  // work
  cb(ok({ code: room.code }));
  broadcast(io, room);
} catch (e) {
  cb(fail((e as Error).message));
}
```

**Fallback pattern (services):** Functions catch errors internally and fall back to mocks, emitting `console.warn` with a `[aiService]` prefix tag.

## Comments

**File-level comments:** Every server file starts with a 1-2 line comment explaining the module's purpose.
```ts
// In-memory room + game state engine. No DB. Rooms keyed by 4-letter code.
// Socket.IO wiring: maps client events to the room engine and broadcasts state.
// Input sanitization for client payloads (Section 3). Every payload from a client
// is hostile until cleaned...
```

**Inline JSDoc on interface fields:** Optional/non-obvious fields get `/** ... */` doc comments directly on the property. Example from `shared/types.ts`:
```ts
/** Short cuisine / category label, e.g. "Italian", "Tacos". */
category?: string;
priceLevel?: number; // 1-4
```

**Section markers:** Multi-section files use `// ---- section name ----` dividers:
```ts
// ---- code generation ----
// ---- room lifecycle ----
```

**No TODOs/FIXMEs/HACKs** found anywhere in the codebase.

## Component Design (React)

**Pattern:** Screens and components are named function exports. Props interfaces extend HTML element attributes where applicable:
```ts
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}
```

**Variant pattern (UI components):** Variants and sizes are union string types. A `Record<Variant, string>` lookup maps each variant to its CSS class. This pattern is used in `Button.tsx`, `Card.tsx`, `Input.tsx`, `Textarea.tsx`, `Badge.tsx`.

**CSS class naming:** BEM-style `ui-{component}--{modifier}` prefix for UI library components:
- `ui-btn`, `ui-btn--primary`, `ui-btn--lg`, `ui-btn--block`
- `ui-card`, `ui-card--elevated`, `ui-card--pad-lg`

**Barrel exports:** `client/src/components/ui/index.ts` re-exports all UI components and types.

## Shared Code

All types shared between server and client live in `shared/types.ts`. This file contains:
- Protocol types (socket event payloads)
- Domain interfaces (`Restaurant`, `PlayerView`, `RoomView`, etc.)
- One exported utility function `maxPicks()` — the only runtime logic in shared
- Const array `OUTING_TYPES` and its derived type `OutingType`

**Rule:** `shared/types.ts` is types-and-constants only. No classes, no I/O, no side effects.

## Logging

Server only. No client-side logging. Pattern:
- Startup info: `console.log('[where-to] ...')` — bracketed app-name prefix
- Service warnings: `console.warn('[aiService] ...')` — bracketed service-name prefix
- No structured logging library used
