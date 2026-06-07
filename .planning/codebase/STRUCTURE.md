# Codebase Structure
_Last updated: 2026-06-07_

## Summary

Monorepo with three workspaces: `client/` (React SPA), `server/` (Node/Express + Socket.IO), and `shared/` (type-only protocol definitions). Root `package.json` runs both in development via `concurrently`. There is no separate package manager workspace config — `node_modules` is at the root only.

## Directory Layout

```
vibehack-project/
├── shared/
│   └── types.ts              # All shared types + socket payloads + maxPicks()
│
├── server/
│   └── src/
│       ├── index.ts           # HTTP + Socket.IO server entry point
│       ├── socket.ts          # Socket event handlers + broadcast helper
│       ├── rooms.ts           # In-memory game state engine
│       ├── flow.ts            # Phase orchestration, bot AI, countdown timers
│       ├── validate.ts        # Input sanitization helpers
│       └── services/
│           ├── aiService.ts   # Anthropic API — swipe cards + questions
│           └── placesService.ts # Google Places API — restaurant lookup
│
├── client/
│   ├── vite.config.ts         # Vite config (alias @shared→shared/, dev proxy)
│   └── src/
│       ├── main.tsx           # React DOM entry point
│       ├── App.tsx            # Root: providers + phase-based router
│       ├── vite-env.d.ts      # Vite env type declarations
│       │
│       ├── screens/           # One component per game phase
│       │   ├── Home.tsx       # Pre-join: create or join a room
│       │   ├── Lobby.tsx      # Waiting room (host controls, bot management)
│       │   ├── Selecting.tsx  # Restaurant selection (swipe deck or search)
│       │   ├── Answering.tsx  # Answer personalized comedic questions
│       │   ├── Voting.tsx     # Ranked-choice vote on answer cards
│       │   ├── Leaderboard.tsx # Per-round scores
│       │   └── Final.tsx      # Winner reveal + confetti
│       │
│       ├── components/
│       │   ├── ConnBadge.tsx        # Connection status indicator
│       │   ├── Countdown.tsx        # Server-deadline countdown timer
│       │   ├── LeaderboardList.tsx  # Sorted player score list
│       │   ├── PlayerRow.tsx        # Single player row in lobby/leaderboard
│       │   ├── RestaurantCard.tsx   # Restaurant display card
│       │   ├── SwipeDeck.tsx        # Tinder-style swipe UI
│       │   ├── Toast.tsx            # Toast notification context + component
│       │   ├── WaitingFor.tsx       # "Waiting for X players" indicator
│       │   ├── layout/
│       │   │   ├── DecisionTopicDisplay.tsx  # Shows host-set topic
│       │   │   ├── Logo.tsx                  # App logo
│       │   │   ├── RoomCodeBanner.tsx         # Persistent room code display
│       │   │   └── Screen.tsx                # Full-screen layout wrapper
│       │   └── ui/
│       │       ├── index.ts          # Barrel export for all UI primitives
│       │       ├── Badge.tsx         # Pill/badge component
│       │       ├── Button.tsx        # Button variants
│       │       ├── Card.tsx          # Card container
│       │       ├── FormField.tsx     # Label + input wrapper
│       │       ├── Input.tsx         # Text input
│       │       ├── Label.tsx         # Form label
│       │       ├── SegmentedControl.tsx # Tab-style selector
│       │       ├── Textarea.tsx      # Multi-line input
│       │       ├── ui.css            # UI component styles
│       │       └── utils.ts          # CSS class utility (cn/clsx)
│       │
│       ├── lib/
│       │   ├── socket.tsx    # SocketProvider + useGame() + useMe()
│       │   ├── identity.ts   # localStorage playerId persistence
│       │   └── geo.ts        # Geolocation helpers for restaurant search
│       │
│       ├── design/
│       │   ├── index.ts      # Design system barrel export
│       │   └── tokens.ts     # Design tokens (colors, spacing, etc.)
│       │
│       └── styles/
│           └── app.css       # Global app styles
│
├── docs/
│   └── backend-architecture.md  # Historical architecture notes
│
├── scripts/
│   ├── simulate.mjs          # Multi-player simulation script
│   └── simulate-solo.mjs     # Solo simulation script
│
├── .planning/
│   └── codebase/             # GSD codebase analysis documents
│
├── package.json              # Root: scripts (dev, build, start, typecheck)
├── render.yaml               # Render deployment config (server only)
└── vercel.json               # Vercel deployment config (client only)
```

## Directory Purposes

**`shared/`:**
- Purpose: Single source of truth for all types crossing the wire between client and server
- Contains: TypeScript interfaces, socket payload types, `Phase` enum, `maxPicks()` function
- Key files: `shared/types.ts`

**`server/src/`:**
- Purpose: All server logic — HTTP, WebSocket, game engine, external services
- Contains: Express app, Socket.IO handlers, room state machine, AI/Places integrations
- Key files: `server/src/index.ts`, `server/src/rooms.ts`, `server/src/flow.ts`

**`server/src/services/`:**
- Purpose: External API integrations, each with a mock fallback
- Contains: Anthropic LLM calls, Google Places calls, static mock data
- Key files: `server/src/services/aiService.ts`, `server/src/services/placesService.ts`

**`client/src/screens/`:**
- Purpose: One top-level React component per game phase; rendered by `App.tsx` based on `room.phase`
- Contains: All phase-specific UI and interaction logic
- Key files: `client/src/screens/Home.tsx` (entry), `client/src/screens/Selecting.tsx` (most complex)

**`client/src/components/`:**
- Purpose: Shared presentational components used across multiple screens
- Contains: Game-specific components (Countdown, SwipeDeck, LeaderboardList) and layout wrappers

**`client/src/components/ui/`:**
- Purpose: Generic, reusable UI primitives with no game logic
- Contains: Button, Card, Input, Badge, etc.
- Import via: `import { Button, Card } from '../components/ui'` (barrel at `ui/index.ts`)

**`client/src/lib/`:**
- Purpose: Non-UI client utilities: Socket.IO context, identity, geolocation
- Key files: `client/src/lib/socket.tsx` (primary state source for all screens)

**`client/src/design/`:**
- Purpose: Design tokens and design system exports
- Key files: `client/src/design/tokens.ts`

**`scripts/`:**
- Purpose: Development/testing simulation scripts (not part of the app bundle)
- Generated: No
- Committed: Yes

## Key File Locations

**Entry Points:**
- `server/src/index.ts`: Server startup — Express, Socket.IO, static file serving
- `client/src/main.tsx`: Client startup — React DOM mount

**Configuration:**
- `client/vite.config.ts`: Vite config including `@shared` alias and dev proxy to server
- `package.json`: Monorepo scripts, all dependencies
- `render.yaml`: Production server deploy config
- `vercel.json`: Production client deploy config

**Core Logic:**
- `shared/types.ts`: All shared types — start here when tracing any data structure
- `server/src/rooms.ts`: Game state — all room/player mutations live here
- `server/src/flow.ts`: Phase advancement and timers — controls when phases change
- `server/src/socket.ts`: Socket event wiring — maps events to game engine
- `client/src/lib/socket.tsx`: React context — all screens get state from `useGame()`
- `client/src/App.tsx`: Phase-to-screen router

**Testing/Simulation:**
- `scripts/simulate.mjs`: Simulates a full multi-player game session
- `scripts/simulate-solo.mjs`: Simulates a solo session with bots

## Naming Conventions

**Files:**
- React components: PascalCase (`Selecting.tsx`, `SwipeDeck.tsx`)
- Server modules: camelCase (`rooms.ts`, `aiService.ts`, `placesService.ts`)
- Utility/lib files: camelCase (`identity.ts`, `geo.ts`)
- Config files: kebab-case by convention (`vite.config.ts`)

**Directories:**
- Feature groupings: camelCase plural (`screens/`, `services/`, `components/`)
- Design/style: lowercase singular (`design/`, `styles/`)
- Sub-groupings: lowercase (`layout/`, `ui/`)

## Where to Add New Code

**New game phase:**
1. Add phase name to `Phase` union in `shared/types.ts`
2. Add phase transition logic in `server/src/rooms.ts` and wire into `flow.ts` `tick()`
3. Create screen component in `client/src/screens/NewPhase.tsx`
4. Add `case 'newphase':` to `App.tsx` Router switch

**New socket event:**
1. Add payload type to `shared/types.ts`
2. Add handler in `server/src/socket.ts` `registerHandlers()`
3. Call `emit('event:name', payload)` from the relevant client screen via `useGame().emit`

**New reusable UI component:**
- Implementation: `client/src/components/ui/ComponentName.tsx`
- Export from: `client/src/components/ui/index.ts`
- Styles: add to `client/src/components/ui/ui.css`

**New game-specific component (not a UI primitive):**
- Implementation: `client/src/components/ComponentName.tsx`
- No barrel required unless widely reused

**New external service integration:**
- Implementation: `server/src/services/myService.ts`
- Pattern: export a config object (`myServiceConfig`) with `USE_MOCKS`, provide mock data, wrap live calls in try/catch with mock fallback

**New shared type:**
- Add to `shared/types.ts` — both sides import from `@shared/types.ts` (client) or `../../shared/types.ts` (server)

## Special Directories

**`.planning/`:**
- Purpose: GSD planning documents and codebase analysis
- Generated: Yes (by GSD commands)
- Committed: Yes

**`client/dist/`:**
- Purpose: Vite build output; served by Express in single-service mode
- Generated: Yes (`npm run build`)
- Committed: No (in `.gitignore`)

**`node_modules/`:**
- Purpose: All dependencies (root-level only; no workspace-level node_modules)
- Generated: Yes
- Committed: No

---

*Structure analysis: 2026-06-07*
