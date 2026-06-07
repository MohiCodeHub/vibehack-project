# Architecture
_Last updated: 2026-06-07_

## Summary

"Where To?" is a real-time multiplayer party game that helps a group decide where to eat. It uses a client-server split: a React SPA on the client communicates exclusively via Socket.IO with a Node/Express server that holds all game state in-memory. No database — rooms live in a server-side `Map` and are reaped after 6 hours of inactivity.

## System Overview

```
┌────────────────────────────────────────────────────────────┐
│                   React SPA (Vite)                         │
│              client/src/                                   │
│                                                            │
│  screens/            ← phase-mapped views (Home, Lobby,    │
│    Home.tsx             Selecting, Answering, Voting,      │
│    Lobby.tsx            Leaderboard, Final)                │
│    Selecting.tsx                                           │
│    Answering.tsx     ← renders private state from server   │
│    Voting.tsx                                              │
│    Leaderboard.tsx                                         │
│    Final.tsx                                               │
│                                                            │
│  lib/socket.tsx      ← SocketProvider + useGame() hook     │
│  lib/identity.ts     ← persistent playerId (localStorage)  │
│  lib/geo.ts          ← geolocation helpers                 │
└───────────────────────┬────────────────────────────────────┘
                        │  Socket.IO (WebSocket / polling)
              events:   │    client→server: room:create, room:join,
                        │      room:start, restaurant:lock,
                        │      answers:submit, vote:submit, …
                        │    server→client: room:update, private:update
                        │
┌───────────────────────┴────────────────────────────────────┐
│               Express + Socket.IO Server                   │
│               server/src/                                  │
│                                                            │
│  index.ts       ← HTTP entry point, CORS, Socket.IO setup  │
│  socket.ts      ← event handlers, broadcast helper         │
│  rooms.ts       ← in-memory room + game state engine       │
│  flow.ts        ← phase-advance orchestration + timers     │
│  validate.ts    ← input sanitization                       │
│                                                            │
│  services/                                                 │
│    aiService.ts    ← Anthropic API (comedic questions)     │
│    placesService.ts← Google Places API (restaurants)       │
└────────────────────────────────────────────────────────────┘
                        │
                        │  shared/types.ts
                        │  (imported by both sides — type-only,
                        │   zero runtime cost)
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| `index.ts` | HTTP server, CORS allowlist, Socket.IO bootstrap, static file serving | `server/src/index.ts` |
| `socket.ts` | Maps socket events to room engine calls; calls `tick()` after every mutation; broadcasts after every change | `server/src/socket.ts` |
| `rooms.ts` | In-memory room/player state engine — create/join/start/lock/answer/vote/tally/reset; serializes `RoomView` and `PrivateState` | `server/src/rooms.ts` |
| `flow.ts` | Auto-advances phases once all players have acted; drives server-side bots; arms/expires per-phase countdown timers | `server/src/flow.ts` |
| `validate.ts` | Sanitizes all client-supplied strings (names, codes, restaurant names, topics) | `server/src/validate.ts` |
| `aiService.ts` | Generates swipe cards and personalized comedic questions via Anthropic API; falls back to static mocks | `server/src/services/aiService.ts` |
| `placesService.ts` | Resolves restaurant names and swipe profiles via Google Places API; falls back to 12 sample restaurants | `server/src/services/placesService.ts` |
| `lib/socket.tsx` | React context that owns the Socket.IO singleton, `room` + `priv` state, and the `emit()` helper | `client/src/lib/socket.tsx` |
| `App.tsx` | Root component: `SocketProvider` → `ToastProvider` → `Router` (switches on `room.phase`) | `client/src/App.tsx` |
| `shared/types.ts` | All shared TypeScript types + socket payload types + the `maxPicks()` function | `shared/types.ts` |

## Pattern Overview

**Overall:** Server-authoritative real-time state machine

**Key Characteristics:**
- The server owns all truth; clients are thin renderers of `RoomView` + `PrivateState`
- Every client action emits a Socket.IO event → server mutates room → `broadcast()` pushes new state to all clients in the room
- Phase transitions are driven by `tick()` in `flow.ts`, called after every mutation — not by client navigation
- The client has no router; `App.tsx` renders the correct screen purely from `room.phase`

## Layers

**Shared protocol layer:**
- Purpose: Type definitions for all data shared across the wire
- Location: `shared/types.ts`
- Contains: `Phase`, `RoomView`, `PrivateState`, socket payload types, `maxPicks()` utility
- Depends on: nothing
- Used by: both `server/src/` and `client/src/`

**Server — transport layer:**
- Purpose: Accept socket connections, validate payloads, dispatch to game engine, broadcast results
- Location: `server/src/socket.ts`
- Contains: `registerHandlers()`, `broadcast()`
- Depends on: `rooms.ts`, `flow.ts`, `validate.ts`, `aiService.ts`, `placesService.ts`
- Used by: `server/src/index.ts`

**Server — game engine:**
- Purpose: Pure state mutations for all game actions; serialization to client-safe views
- Location: `server/src/rooms.ts`
- Contains: `Room`/`Player` interfaces (internal), all exported mutation functions, `serializeRoom()`, `privateStateFor()`
- Depends on: `shared/types.ts`, `aiService.ts`
- Used by: `socket.ts`, `flow.ts`

**Server — orchestration:**
- Purpose: Phase auto-advance, bot AI, server-side countdown timers
- Location: `server/src/flow.ts`
- Contains: `tick()`, `armTimer()`, `driveBots()`, `forceAdvance()`, `setBroadcaster()`
- Depends on: `rooms.ts`, `placesService.ts`
- Used by: `socket.ts`, `index.ts` (broadcaster injection)

**Client — state layer:**
- Purpose: Single Socket.IO connection; distributes `room` and `priv` state via React context
- Location: `client/src/lib/socket.tsx`
- Contains: `SocketProvider`, `useGame()`, `useMe()`
- Depends on: `shared/types.ts`, `lib/identity.ts`
- Used by: all screens and components

**Client — screen layer:**
- Purpose: Phase-specific UI; reads from `useGame()`, calls `emit()` for actions
- Location: `client/src/screens/`
- Contains: one screen component per phase + `Home`
- Depends on: `lib/socket.tsx`, UI components

## Data Flow

### Primary Request Path (example: player submits a vote)

1. Player taps submit in `Voting.tsx` → calls `emit('vote:submit', { ranked })` (`client/src/screens/Voting.tsx`)
2. `socket.ts` receives `vote:submit`, calls `submitVote(room, playerId, ranked)` to validate and record (`server/src/socket.ts`)
3. `tick(room)` runs: `allVoted()` → `tallyRoundAndAdvance()` flips phase to `leaderboard`; `armTimer()` clears old timer (`server/src/flow.ts`)
4. `broadcast(io, room)` sends `room:update` (new `RoomView`) to every socket in the room and `private:update` to each individual socket (`server/src/socket.ts`)
5. `SocketProvider` receives `room:update`, sets React state → all subscribed screens re-render (`client/src/lib/socket.tsx`)
6. `App.tsx` `Router` sees `room.phase === 'leaderboard'` → renders `<Leaderboard />` (`client/src/App.tsx`)

### Phase Timer Expiry Path

1. `armTimer()` in `flow.ts` sets a `setTimeout` for the timed phase duration (selecting: 90s, answering: 75s, voting: 45s)
2. On expiry, `onExpire(code)` calls `forceAdvance(room)` — assigns random restaurants to missing players, or force-advances voting/answering
3. `tick(room)` then drives bots and re-arms the next timer
4. `broadcaster(room)` (injected at startup from `index.ts`) pushes the new state to all clients

**State Management:**
- Server: mutable `Room` objects in a `Map<string, Room>` (module-level singleton in `rooms.ts`)
- Client: `RoomView | null` and `PrivateState | null` held in React `useState` inside `SocketProvider`; no client-side store (Redux/Zustand/etc.)

## Key Abstractions

**`RoomView` (broadcast state):**
- Purpose: Client-safe, serialized snapshot of a room — no internal player secrets
- Examples: `shared/types.ts` (type), `server/src/rooms.ts` (`serializeRoom()`)
- Pattern: Computed on every broadcast; never stored; restaurant names are public, full details are private

**`PrivateState` (per-player private state):**
- Purpose: Per-socket slice — a player's own questions and locked restaurant
- Examples: `shared/types.ts` (type), `server/src/rooms.ts` (`privateStateFor()`)
- Pattern: Sent on a targeted `private:update` directly to the player's socket after every broadcast

**`tick()` (idempotent phase pump):**
- Purpose: Advance the room as far as possible after any mutation — bots act, then phases auto-advance once conditions are met
- Examples: `server/src/flow.ts`
- Pattern: Called after every socket handler that mutates room state; safe to call multiple times; guarded by a 25-iteration loop to prevent infinite cycles

## Entry Points

**Server:**
- Location: `server/src/index.ts`
- Triggers: `npm start` / `npm run dev:server`
- Responsibilities: Express app, HTTP server, Socket.IO server, static client serving (single-service mode), broadcaster injection, room reaper interval

**Client:**
- Location: `client/src/main.tsx`
- Triggers: Vite dev server or built `client/dist/index.html`
- Responsibilities: React DOM mount, wraps `<App>` in `React.StrictMode`

## Architectural Constraints

- **No database:** All room state is in-memory in `server/src/rooms.ts`; a server restart clears all rooms
- **Threading:** Single-threaded Node.js event loop; `beginAnswering()` is async (awaits AI calls) but does not block the event loop
- **Global state:** `rooms` Map (`server/src/rooms.ts` line 51), `timers` Map and `broadcaster` function (`server/src/flow.ts` lines 140, 143) — all module-level singletons
- **Player identity:** Client-generated `playerId` stored in `localStorage` (`client/src/lib/identity.ts`); sent in every socket payload; reconnect logic in `joinRoom()` uses it to restore session
- **CORS:** Allowlist-driven in production via `CLIENT_ORIGIN` env var; `*.vercel.app` preview deploys always allowed

## Anti-Patterns

### Client-side phase routing
**What happens:** Screens must not try to navigate by changing a local "current page" variable.
**Why it's wrong:** The phase is server-authoritative. Client-side navigation would diverge from `room.phase`.
**Do this instead:** Read `room.phase` from `useGame()` — `App.tsx` already does this. All screens get the phase via context, not props or local state.

### Trusting client vote payloads
**What happens:** `submitVote()` in `rooms.ts` validates ranked arrays on the server, not the client.
**Why it's wrong:** Clients can send malformed payloads; server must be the single source of truth.
**Do this instead:** Always validate in `server/src/rooms.ts` (`submitVote`, `submitAnswers`) — never skip server-side validation for socket payloads.

## Error Handling

**Strategy:** Every socket handler returns an `Ack<T>` (`{ ok: boolean; error?: string; data?: T }`). Errors never throw to the client — they are returned as `{ ok: false, error: "..." }`.

**Patterns:**
- Server handlers: return `fail(message)` early on validation errors, `ok(data)` on success
- Async handlers: try/catch around external API calls; services fall back to mocks on failure
- AI/Places services: all external calls wrapped in try/catch with mock fallback and `console.warn` logging

## Cross-Cutting Concerns

**Logging:** `console.log`/`console.warn` only; no structured logging library
**Validation:** All client input sanitized in `server/src/validate.ts` before reaching game engine
**Authentication:** None — identity is a client-generated UUID in `localStorage`, sent in every payload

---

*Architecture analysis: 2026-06-07*
