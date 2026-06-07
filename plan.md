# WhereTo? — Backend Hardening Plan (v2, repo-aware)

Targets the actual repo: `server/rooms.ts`, `server/flow.ts`, `server/socket.ts`, `server/aiService.ts`, `server/placesService.ts`, `server/index.ts`, with shared types in `shared/types.ts`.

The foundation (server-authoritative state, stable `playerId`, auto-rejoin, sanitized `RoomView`/`PrivateState`, host migration) is already done. This plan covers what is most likely still fragile or missing.

---

## What you already have (confirm, do not rebuild)

- One server-owned room object per code, all rules in `rooms.ts`.
- Per-phase auto-advance via `flow.ts` `tick()` plus host-gated deliberate steps.
- Persistent `playerId` in `localStorage`, rebind by id (name fallback), no duplicate slots.
- Sanitized broadcasts: `RoomView` to room + `PrivateState` per player. Answers stay private until voting. This is the correct privacy model.
- Mockable AI and Places services with `USE_MOCKS=true` default.
- Bots and two simulation scripts as your test harness.

If a section below assumes something you already have, skip it. The list is ordered by demo-killing risk.

---

## Frontend note (post-redesign — read before any client change)

The client was rebuilt on a design system, so file paths in the Visual checks below changed:

- Screens live in `client/src/screens/*` and now wrap content in `<Screen>` (`components/layout/`).
- Shared UI primitives are in `client/src/components/ui/` (`Button`, `Input`, `Textarea`, `SegmentedControl`, `FormField`, `Badge`, `Card`) — re-use these, don't hand-roll inputs/buttons.
- Global styles are in `client/src/styles/app.css`; design tokens in `client/src/design/tokens.css` (`--ds-*`). **`client/src/styles.css` no longer exists** — put any new CSS in `app.css` using the `--ds-*` tokens.
- New backend-facing widget added in Section 1: `components/Countdown.tsx` (renders `room.deadlineTs`).
- UI copy is loud/caps ("CAST VOTE", "QUIZZIN' TIME", "LOCKED IN!"); answering is now **one question at a time** (Q1→Q3), and voting has 1/2/3 rank dots + a "CAST VOTE" button.

---

## 1. The submit gate and phase transitions (`flow.ts`, `rooms.ts`) — ✅ implemented

Done on the `backend` branch: connected-only gates (1a, already present), server-authoritative
phase timers with `deadlineTs` broadcast in `RoomView` + a `Countdown` (1c), and phase guards
in the room engine (1d). **1b (host manual skip) was dropped at the user's request** — the
phase timer is the only auto-advance safety net. Original notes kept below for reference.

The single most common demo bug in this kind of game is "the game hangs because we are waiting on a submission that will never arrive." Audit `tick()` for these:

### 1a. Advance on *connected* players only
The "everyone locked / answered / voted" predicate must count only currently connected humans (plus bots). A disconnected player must not block the round.

```ts
function activePlayers(room: Room) {
  return Object.values(room.players).filter(p => (p.connected || p.isBot) && !p.eliminated);
}
function allAnswered(room: Room) {
  const active = activePlayers(room);
  return active.length > 0 && active.every(p => room.answers[p.id]);
}
```

If a player reconnects mid-phase, they get the `PrivateState` snapshot and can still submit. Good.

### 1b. Host manual advance (safety net) — ❌ dropped
Originally: a `host:next` event + a host "Skip / Next" button as a live-demo escape hatch.
Removed at the user's request as unnecessary — the server-side phase timer (1c) already
force-advances any wedged phase, so the manual button was redundant.

### 1c. Server-authoritative timers with `deadlineTs`
If you do not already have phase timers, add them: store `deadlineTs: number | null` on the room, set a `setTimeout` that calls the same advance function the submit gate calls, and include `deadlineTs` in `RoomView`. The client renders a countdown from that timestamp; never trust the client clock for logic.

```ts
type PhaseTimer = { handle: NodeJS.Timeout; deadlineTs: number };
const timers = new Map<string, PhaseTimer>();

function startPhaseTimer(room: Room, ms: number, onExpire: () => void) {
  clearPhaseTimer(room.code);
  const deadlineTs = Date.now() + ms;
  const handle = setTimeout(() => { timers.delete(room.code); onExpire(); }, ms);
  timers.set(room.code, { handle, deadlineTs });
  room.deadlineTs = deadlineTs;
}
function clearPhaseTimer(code: string) {
  const t = timers.get(code);
  if (t) { clearTimeout(t.handle); timers.delete(code); }
}
```

Critical: clear the timer on every phase exit, on room destroy, and on host-forced advance. A leaked timer firing on a stale phase will trigger a wrong transition.

### 1d. Phase guards on every handler
Every `socket.on(...)` in `socket.ts` should reject events for the wrong phase. Otherwise a delayed packet from a slow client can mutate state across a phase boundary.

```ts
function inPhase(room: Room, ...phases: Phase[]) {
  return phases.includes(room.phase);
}
// in handler:
if (!inPhase(room, 'answering')) return;
```

**Visual check:** Open the game in two browser tabs (two players) and add a bot. Start, lock restaurants, reach the Answering screen — you should see a **⏱ countdown pill** at the top. In tab 2, step through and submit all answers; in tab 1, leave it blank and close that tab. The remaining tab should still move on to Voting on its own when the countdown hits 0. You should never be stuck on "waiting for players."

---

## 2. Voting integrity for ranked top-3 (`rooms.ts`) — ✅ implemented

Done: a shared `maxPicks(availableAnswers)` in `shared/types.ts` (single source for server,
client, and bots), strict server-side validation in `submitVote` (exact count, distinct, no
self, real answers this round), and idempotent overwrite by `votes[round]`. The client now
renders `need` rank dots and only enables CAST VOTE at the exact count. Verified by both
simulation scripts. Original notes kept below for reference.

Your voting model is ranked top 3 (🥇+3 / 🥈+2 / 🥉+1, no self-vote). This has subtle edge cases the original single-vote plan did not cover.

### 2a. Player-count edge cases
With 2 to 6 players, after excluding self, the candidate pool is N-1 answers. With small N you cannot rank 3:
- **2 players**: 1 candidate. Award 1 pick worth 3 points (or skip voting since the only "winner" is forced).
- **3 players**: 2 candidates. Award 🥇 (+3) and 🥈 (+2).
- **4+ players**: full top 3.

Decide the rule once, encode it in a `function maxPicks(activeCount: number): number`, and use it everywhere (server validation, client UI guidance, bot voting).

### 2b. Server-side vote validation
Do **not** trust the client to enforce the rules. On vote submission, the server must reject if:
- Phase is not `voting`.
- Number of picks does not match `maxPicks(activeCount)`.
- Picks are not all distinct.
- Any pick is the voter's own answer.
- Any pick references a player without an answer this round.

```ts
function validateVote(room: Room, voterId: string, picks: string[]): string | null {
  if (room.phase !== 'voting') return 'wrongPhase';
  const need = maxPicks(activePlayers(room).length);
  if (picks.length !== need) return 'badPickCount';
  if (new Set(picks).size !== picks.length) return 'duplicatePicks';
  if (picks.includes(voterId)) return 'selfVote';
  if (picks.some(id => !room.answers[id])) return 'noSuchAnswer';
  return null;
}
```

### 2c. Idempotent submission
Re-submitting a vote (network retry) should overwrite cleanly, not double-count. Same for answers and locks. Keyed-by-`playerId` maps already give you this for free; just confirm no handler does `array.push` anywhere.

**Visual check:** Run a 2-player game (one tab + one bot): on the Voting screen you should be allowed to pick exactly **1** answer, and the leaderboard awards it +3. Then run a 4-player game (one tab + 3 bots): you should be required to fill all **3** rank dots (1/2/3, 🥇🥈🥉) before the **"CAST VOTE"** button enables, and you should not be able to pick your own answer or the same answer twice.

---

## 3. Input validation and safety (`socket.ts`)

Every payload from the client is hostile until validated. At minimum, on entry to every handler:

- Player name: trim, length 1 to 20, strip control chars, reject if empty after trim.
- Restaurant manual input: trim, length 1 to 60.
- Answer text: trim, length 1 to 280.
- Room code: uppercase, exactly 4 letters, regex `/^[A-Z]{4}$/`.

A 1-line zod or hand-rolled validator at the top of each handler is enough. The hackathon failure mode is not malicious; it is a player named `""` or a 20kb pasted answer breaking the layout.

### 3a. Duplicate destination prevention (case-insensitive)
When a player locks a manually-typed restaurant, normalise for comparison:

```ts
const norm = (s: string) => s.trim().toLowerCase();
const taken = new Set(
  Object.values(room.players)
    .filter(p => p.id !== playerId && p.restaurant)
    .map(p => norm(p.restaurant!.name))
);
if (taken.has(norm(input.name))) {
  ack({ ok: false, reason: 'destinationTaken' }); return;
}
```

The Places resolution step can short-circuit duplicates earlier by resolving to a `place_id` and comparing on that instead of name.

**Visual check:** On the Home screen, try to join/create with an empty name — the button should stay disabled or show an error, never let you in blank. In Selecting, choose "I have a pick" and paste a giant block of text into the restaurant search field; it should be cut off or rejected, not break the layout. Then in two tabs lock the same restaurant (e.g. "nonna's" vs "Nonna's") — the second tab should be told the destination is already taken.

---

## 4. AI service hardening (`aiService.ts`)

The biggest hidden risk: a live LLM call hanging or returning malformed JSON during the demo. `USE_MOCKS=true` saves you offline; the live path needs the same belt-and-braces.

### 4a. Wrap every call with timeout + try/catch + fallback to mock
The mock is not just a dev convenience; it is your runtime fallback. Restructure so the live path is wrapped:

```ts
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('llmTimeout')), ms)),
  ]);
}

export async function generateQuestions(restaurant: Restaurant): Promise<string[]> {
  if (USE_MOCKS) return mockQuestions(restaurant);
  try {
    const raw = await withTimeout(callClaude(promptFor(restaurant)), 8000);
    const parsed = parseQuestions(raw);  // strip ```json fences, JSON.parse, validate shape
    if (!Array.isArray(parsed) || parsed.length < 3) throw new Error('badShape');
    return parsed.slice(0, 3);
  } catch (e) {
    console.warn('[ai] generateQuestions fallback:', (e as Error).message);
    return mockQuestions(restaurant);
  }
}
```

Apply the same pattern to swipe-deck candidate generation and anywhere else the LLM is called. The game must *never* get stuck on an LLM call.

### 4b. Pre-generate questions during the `selecting` phase
Questions for all 3 rounds per player can be generated as soon as that player locks their restaurant, while the rest of the group is still picking. Cache them on the player object. By the time `answering` begins, questions are ready instantly; LLM latency is hidden behind human-paced phases.

### 4c. Defensive JSON parsing
LLMs do return prose-wrapped JSON. Have one helper:

```ts
function stripFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}
function safeJson<T>(s: string): T | null {
  try { return JSON.parse(stripFences(s)) as T; } catch { return null; }
}
```

Validate shape after parsing. Never trust the parse alone.

**Visual check:** Start the server with a deliberately bad/blank LLM key (live mode, not mocks), then play through. When you reach the Answering screen you should be able to step through all 3 questions (Q1/3 → Q3/3) with real prompts (the mock fallback), not a spinner that never resolves or an empty screen. Also confirm the first question (Q1/3) shows the instant Answering starts — no visible "loading questions" wait — proving they were pre-generated during Selecting.

---

## 5. Places service hardening (`placesService.ts`)

Same treatment as AI: timeout, try/catch, fallback to a sensible mock or to "we couldn't find that place, type a different one."

- Timeout on the Google Places call (5s).
- Cache results by `(query, lat, lng, radius)` per process to avoid repeat hits during a single room's lifetime.
- On hard failure: if the player typed a name, accept it as a free-text restaurant with no `place_id`, no photo, no map link, rather than failing the lock. The game must continue.
- On the swipe-deck path, fall back to the mock 12-restaurant list if Places returns nothing.

**Visual check:** In Selecting, type a nonsense restaurant name like "asdfghjkl" and lock it — it should be accepted as a plain free-text pick (name shows, no crash), not block you. Then use "Help me decide," swipe through the cards, and confirm you always land on 3–4 candidate restaurants to choose from, even with a bad/blank Places key.

---

## 6. Memory and room lifecycle (`rooms.ts`)

In-memory state plus Render free-tier sleep means you should not stress about long-term leaks, but within a session you still need:

- **Disconnect grace period**: do not destroy a player slot on `disconnect`. Keep them around with `connected: false` so they can rejoin. The current code already does this; confirm.
- **Room TTL**: a room with zero connected players for more than, say, 10 minutes should be GC'd. Otherwise repeated demo runs accumulate dead rooms.
- **Timer cleanup**: when a room is destroyed, clear its phase timer. Otherwise `setTimeout` fires against an undefined room and throws.
- **Bot cleanup**: clear any bot-driven timers on phase exit and room destroy.

```ts
function destroyRoom(code: string) {
  clearPhaseTimer(code);
  clearBotTimers(code);
  rooms.delete(code);
}
```

A simple periodic sweep is fine:

```ts
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const anyHuman = Object.values(room.players).some(p => !p.isBot && p.connected);
    if (!anyHuman && now - room.lastActivityTs > 10 * 60_000) destroyRoom(room.code);
  }
}, 60_000);
```

Bump `room.lastActivityTs` on every state-mutating event.

**Visual check:** Mid-game, refresh one player's tab (or briefly turn off Wi‑Fi and back on). That player should pop back into their exact slot with their score and current screen intact — no duplicate copy of them in the player list. Their name should flip from grey/"offline" back to active. Creating fresh rooms repeatedly should keep working and keep generating new codes.

---

## 7. Reconnect edge cases (`rooms.ts`, `socket.ts`)

The id-then-name fallback is a known smell: two players named "Sam" can collide. Audit and tighten:

- Prefer id match. Only fall back to name match if no id match was found *and* the matched slot is currently disconnected (never steal a slot from an active socket).
- If a rejoin attempt arrives for a room in `final` phase, send the final state and a "game ended" flag. Do not try to re-seat them mid-game.
- If a rejoin arrives for a non-existent room code (Render restart wiped it), respond with a clear `roomNotFound` error so the client can clear `localStorage` and route home instead of looping.

**Visual check:** Play to the Final screen, then refresh that tab — you should land back on the final result, not get re-seated into a broken game. Separately, while sitting in a room, restart the server, then act in the tab: it should bounce you cleanly to the Home screen with a "room not found" message, not spin forever or loop.

---

## 8. Bot robustness (`flow.ts`)

Bots are part of your demo and must never crash a room.

- Bot answer/vote generation should call the same wrapped AI service with fallback to canned lines.
- If a bot's action throws, log and have the bot use a hardcoded line; do not let the exception bubble up and stop `tick()`.
- Bot timers must be cleared on phase change and room destroy (see Section 6).

**Visual check:** Add 3 bots, start solo, and play through every phase. The bots should always lock a restaurant, submit answers, and cast votes without you ever waiting on them, and their answers should appear as cards in voting. Do a full run with a bad/blank LLM key too — bots should still produce canned answers and the game should reach the Final screen.

---

## 9. Observability (`index.ts`, `rooms.ts`)

Cheap wins that pay off live:

- Prefix every log with `[room:ABCD]` so the terminal during the demo is readable.
- Add a dev-only `GET /api/rooms/:code/debug` (gated behind `NODE_ENV !== 'production'` or a token) that returns the full room state. Lets you check what's wrong without redeploying.
- Emit a `server:error` socket event with `{ code, message }` on validation failures so the client can surface a toast. Right now silent rejects look identical to a hung server to the user.

**Visual check:** Trigger any rejected action (e.g. try to lock a duplicate restaurant, or submit an invalid vote) — a clear toast/error message should pop up in the browser instead of the action silently doing nothing. In dev, open `http://localhost:3001/api/rooms/<your-code>/debug` in a browser tab and confirm you see the room's current state as JSON.

---

## 10. Render free-tier cold start

Two demo-killing scenarios:

1. **First connect after sleep**: client sends `room:join`, the dyno is spinning up, the WebSocket fails. The client should retry with exponential backoff (Socket.IO does this by default; just confirm `reconnection: true`). Show a "waking server..." toast on the host screen on the first 5+ seconds of connection delay.
2. **Mid-demo restart wiping rooms**: cannot prevent it. Mitigate by hitting the `/api/health` endpoint from a cron or from the host screen on load and every 10 min while in lobby. This keeps the dyno warm during a known-active session.

A 3-line client-side `useEffect` that pings `/api/health` periodically while the user is on the home/lobby screens is enough.

**Visual check:** Against the deployed Render URL, open the app after it's been idle/asleep. The first load should show a "waking server…" message rather than a dead blank screen, then connect on its own within a minute (no manual refresh). While you sit in the lobby, it should stay connected indefinitely rather than dropping after a few minutes.

---

## 11. Concurrency and races

Node is single-threaded, so you only have async-boundary races, not real concurrency. Still worth checking:

- Anywhere a handler is `async`, the room state can change between `await` points. Re-check the phase and re-fetch the room from the map *after* every `await` before mutating.

```ts
async function handleLock(roomCode: string, playerId: string, name: string) {
  let room = rooms.get(roomCode);
  if (!room || !inPhase(room, 'selecting')) return;
  const resolved = await placesService.resolve(name, room.location);
  room = rooms.get(roomCode);                   // re-fetch
  if (!room || !inPhase(room, 'selecting')) return; // re-check
  // ... mutate
}
```

This is the single biggest source of "weird, unrepeatable" bugs in async game servers.

**Visual check:** In Selecting, type a restaurant name and lock it at the same moment the round is ending (or have a bot/other tab finish so the phase flips just as you submit). You should either lock cleanly or get a clean rejection — never a duplicate pick, a stuck screen, or your pick landing in the wrong phase. Repeat a few times; behaviour should be consistent every time, not random.

---

## File-by-file change list

| File | Sections | Priority |
|---|---|---|
| `server/flow.ts` | 1a, 1c, 1d, 8 | Critical |
| `server/rooms.ts` | 2a, 2b, 2c, 6, 7, 11 | Critical |
| `server/socket.ts` | 1b, 1d, 3, 9 | Critical |
| `server/aiService.ts` | 4a, 4b, 4c | Critical |
| `server/placesService.ts` | 5 | High |
| `server/index.ts` | 9, 10 | Medium |
| `shared/types.ts` | Add `deadlineTs`, error codes, `maxPicks` rule | Low |

---

## Backend smoke test before the demo

Extend `scripts/simulate-solo.mjs` or add a new script that exercises each failure mode:

- [ ] Start a game, kill one player's connection mid-answering, time runs out, game advances cleanly.
- [ ] Start a game with `USE_MOCKS=false` and an invalid API key. Game completes end-to-end on fallbacks.
- [ ] Host disconnects mid-game. Host migrates. Game continues.
- [ ] Submit a vote with 0 picks, with 5 picks, with a duplicate, with self in it. Each rejected with a clear error.
- [ ] Submit a 50,000-char answer. Rejected.
- [ ] Two players try to lock the same restaurant (case-different). Second one rejected.
- [ ] Run 2-player game: voting awards 1 pick at +3 cleanly.
- [ ] Run 6-player game: voting awards top 3.
- [ ] Force-advance from host through every phase. Nothing throws.
- [ ] Run 10 simulate-solo back to back. Memory usage flat (no room leak).

If all ten pass, the backend will survive the demo.