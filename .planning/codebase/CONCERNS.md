# CONCERNS
_Last updated: 2026-06-07_

## Summary

This is a real-time Socket.IO party game with all state held in-process RAM. The foundation is solid — server-authoritative state, input validation, phase timers, and vote integrity are all in place. The main open risks are incomplete hardening tasks tracked in `PROGRESS.md` (sections 4–11 are mostly open), plus structural issues from pure in-memory architecture: no persistence, no multi-instance support, and a single-process concurrency model with unguarded async race conditions.

---

## Tech Debt

**No phase re-check after `await` in socket handlers:**
- Issue: Every async handler in `server/src/socket.ts` mutates room state after an `await` (e.g. `restaurant:lock` awaits `tick()`, `answers:submit` awaits `tick()`). Between the `await` and the mutation, another player's event can run and change the phase. The room is never re-fetched or re-checked after the `await` resolves.
- Files: `server/src/socket.ts` (lines 95–215)
- Impact: Race conditions that are rare but unpredictable — a player's lock can land in the wrong phase, producing silent misbehaviour or a stuck room.
- Fix approach: After every `await` in a handler, re-fetch the room with `getRoom(joinedCode)` and re-check the phase before mutating (see `plan.md` §11).

**Bot vote count uses hardcoded `3` instead of `maxPicks`:**
- Issue: In `server/src/flow.ts`, `driveBots()` slices the card list to `3` unconditionally (`shuffle(cards).slice(0, 3)`). For 2-player games this produces an invalid 1-pick vote since `maxPicks(1)` returns `1`, causing `submitVote` to reject with "Pick exactly 1".
- Files: `server/src/flow.ts` (line 88)
- Impact: Bot voting fails silently for small groups; the `submitVote` error is swallowed by the `changed = true` path.
- Fix approach: Replace `.slice(0, 3)` with `.slice(0, requiredPicks(room, room.round, p.id))`.

**`reapRooms` TTL is 6 hours, not 10 minutes:**
- Issue: `reapRooms` in `server/src/rooms.ts` only deletes rooms older than 6 hours with zero connected players. Plan.md §6 specifies 10 minutes. A room with all players disconnected accumulates stale timers for up to 6 hours.
- Files: `server/src/rooms.ts` (line 457), `server/src/index.ts` (line 90)
- Impact: Memory growth during repeated demo sessions; leaked `setTimeout` handles in `flow.ts` for dead rooms.
- Fix approach: Lower default `maxAgeMs` to `10 * 60 * 1000`, and call a `destroyRoom(code)` helper that also calls `clearPhaseTimer(code)`.

**`answers:submit` does not validate that answers are non-empty for all required questions:**
- Issue: `submitAnswers` in `server/src/rooms.ts` only stores answers whose values are non-empty strings. `hasAnsweredAll` then returns false until all questions are filled. A player can call `answers:submit` with a partial payload repeatedly. The check is correct but the client doesn't explicitly warn if partial answers are silently dropped.
- Files: `server/src/rooms.ts` (lines 264–275), `client/src/screens/Answering.tsx`
- Impact: Minor UX confusion; not a correctness bug.

**`outingType` is effectively hardcoded to `'Dinner'`:**
- Issue: `shared/types.ts` defines `OUTING_TYPES = ['Dinner'] as const`. The `room:create` payload accepts any string but the UI only ever sends `'Dinner'`. The field is passed to `generateSwipeCards` and `generateQuestions` prompts but never validated server-side.
- Files: `shared/types.ts` (line 139), `server/src/socket.ts` (line 61), `client/src/screens/Home.tsx` (line 41)
- Impact: Not a bug today, but the field gives false impression of supporting other outing types.

---

## Security Concerns

**No rate-limiting on any Socket.IO event:**
- Risk: Any client can spam `room:create`, `restaurant:search`, or `swipe:candidates` at full speed. `swipe:candidates` triggers a live Google Places API call; `restaurant:search` does the same. A malicious or buggy client can exhaust the API quota or cause the process to fall behind on event processing.
- Files: `server/src/socket.ts`, `server/src/services/placesService.ts`
- Current mitigation: None.
- Recommendations: Add a simple per-socket rate limiter (e.g. token bucket) on the expensive events: `swipe:candidates`, `restaurant:search`, `swipe:cards`.

**`playerId` is client-generated and fully trusted for identity:**
- Risk: Any player can join a room with an arbitrary `playerId` string. If they guess another active player's ID, they reclaim that player's slot (including their restaurant and answers). The name-match fallback for disconnected players is also reachable by guessing a name.
- Files: `server/src/rooms.ts` (lines 129–153), `client/src/lib/identity.ts`
- Current mitigation: `playerId` is a `crypto.randomUUID()` — hard to guess. The name-match fallback only applies to _disconnected_ slots, reducing the window.
- Recommendations: Acceptable for a low-stakes party game. The `randomUUID` source makes ID collision practically impossible. Document that the name-match fallback intentionally steals disconnected slots to support device-switching.

**`swipe:candidates` and `restaurant:search` accept a `loc` object with `lat`/`lng` from the client without coordinate range validation:**
- Risk: The `loc` object is passed directly to the Google Places API as `latitude`/`longitude`. Malformed coordinates (e.g. `Infinity`, `NaN`, strings) would propagate to the external API call.
- Files: `server/src/socket.ts` (lines 148–155), `server/src/services/placesService.ts` (lines 104–163)
- Current mitigation: Google Places API would return an error; the fallback returns mock data.
- Recommendations: Add a simple numeric range check (`-90 ≤ lat ≤ 90`, `-180 ≤ lng ≤ 180`) in `socket.ts` before forwarding to the service.

**CORS wildcard for all Vercel preview deploys:**
- Risk: `isAllowedOrigin` in `server/src/index.ts` allows any `*.vercel.app` subdomain. Any attacker who deploys their own Vercel project can connect to the production backend.
- Files: `server/src/index.ts` (lines 28–38)
- Current mitigation: The game has no persistent user data or payments — impact is limited to room disruption.
- Recommendations: For production, tighten to explicit domains only and remove the `*.vercel.app` wildcard.

**API keys are read from `process.env` at module load; no startup validation:**
- Risk: If `LLM_API_KEY` or `PLACES_API_KEY` is set but malformed (e.g. whitespace, wrong format), the service will fail at runtime during a live session rather than at startup.
- Files: `server/src/services/aiService.ts` (line 6), `server/src/services/placesService.ts` (line 6)
- Current mitigation: Both services fall back to mocks on any thrown error.
- Recommendations: Log a startup warning when keys are present but the `USE_MOCKS` path is not active, so operators know they are running live.

---

## Scalability Risks

**Single in-process `Map` for all room state:**
- Problem: `rooms` in `server/src/rooms.ts` is a plain `Map<string, Room>`. All game state lives in one process's heap.
- Current capacity: Adequate for a small party game — dozens of concurrent rooms with 2–6 players.
- Limit: A second server process (e.g. Render horizontal scale, redeploy) creates an entirely separate `rooms` map. Players on different instances cannot share rooms.
- Scaling path: The architecture doc explicitly calls this out and mandates `1 instance`. To scale beyond one instance, rooms would need a shared external store (Redis, Upstash). This is flagged in `docs/backend-architecture.md` §4 as a deliberate future step.

**Render free-tier spin-down wipes all in-memory state:**
- Problem: Render free web services sleep after ~15 min idle. On wake, all rooms are gone.
- Current capacity: Only usable for scheduled demos with active keep-alive pinging.
- Limit: Any room in progress at spin-down time is permanently lost.
- Scaling path: Switch to an always-on paid Render instance (simplest), or add Redis-backed room persistence.

**Phase timers are `setTimeout` handles in a `Map` keyed by room code:**
- Problem: `timers` Map in `server/src/flow.ts` is module-level. There is no cleanup path triggered on room deletion — `reapRooms` calls `rooms.delete(code)` but never `clearPhaseTimer(code)`.
- Impact: Timer handles for reaped rooms accumulate in `timers`, and when they fire, `getRoom(code)` returns `undefined` (handled gracefully), but the handle is never cleared from the map.
- Fix approach: Add a `destroyRoom(code)` function that deletes from both `rooms` and calls `clearPhaseTimer(code)`, and call it from `reapRooms`.

---

## Incomplete / TODO

The following items are explicitly tracked as open in `PROGRESS.md`:

**Section 1 — Submit gate and phase transitions:**
- `1a`: Advance on connected players only — the gate uses `.filter((p) => p.connected)` but `allRestaurantsLocked` / `allAnswered` / `allVoted` all filter on `p.connected && p.restaurant`, which is correct. Marked incomplete but may already be implemented.
- `1c`: Phase timers with `deadlineTs` — implemented in `flow.ts` and broadcast in `RoomView`. Marked incomplete in `PROGRESS.md` but the code is present.
- `1d`: Phase guards on every handler — not all handlers in `socket.ts` explicitly check phase before acting. `lockRestaurant`, `submitAnswers`, `submitVote` do guard phase inside `rooms.ts`, but `swipe:cards` and `swipe:candidates` have no phase guard.

**Section 4 — AI service hardening (all open):**
- `4a`: No timeout on LLM calls — `llmJson` in `server/src/services/aiService.ts` has no `AbortController` or `Promise.race` timeout. A hung API call during `beginAnswering` would stall all players waiting for the `answering` phase.
- `4b`: Questions are generated at the start of `answering`, not pre-generated during `selecting`. Players experience LLM latency as a visible delay when transitioning phases.
- `4c`: No JSON fence stripping — `llmJson` uses a regex to extract the first JSON array/object but does not strip markdown code fences (` ```json ` ... ` ``` `). Claude models often wrap JSON in fences.

**Section 5 — Places service hardening (all open):**
- No timeout on Google Places calls in `server/src/services/placesService.ts`.
- No caching — every `restaurant:search` and `swipe:candidates` makes a fresh HTTP request.
- The free-text fallback on Places failure exists for `resolveRestaurant` but not for `candidatesForProfileLive`, which would throw on a network error.

**Section 6 — Room lifecycle (mostly open):**
- `reapRooms` does not clear phase timers before deleting rooms (see Scalability Risks above).
- No `lastActivityTs` tracking — the TTL is based on `createdAt`, so an active-then-abandoned room is GC'd 6 hours after creation regardless of when it went idle.

**Section 7 — Reconnect edge cases (open):**
- Rejoin to a `final` phase room: the server sends the full `RoomView` on reconnect but no special "game ended" signal. The client will render the `Final` screen correctly if `room.phase === 'final'`, but there is no explicit test for this path.
- Rejoin to a missing room code: `joinRoom` returns `{ error: 'Room not found' }` which the client surfaces as a toast, but does not clear `localStorage.lastRoom`. The user will see the "Rejoin XXXX" button permanently.

**Section 9 — Observability (all open):**
- No `[room:ABCD]` log prefix on any server-side log.
- No `GET /api/rooms/:code/debug` endpoint.
- No `server:error` socket event — validation failures return a `fail()` ack but are not forwarded as a separate event to all room members.

**Section 10 — Render cold start (partially open):**
- Client shows "Waking the server up…" after 4s disconnect (`Home.tsx` lines 27–31). Done.
- No periodic `/api/health` ping from lobby to keep the dyno warm.

**Section 11 — Concurrency and races (open):**
- No post-`await` room re-fetch in any handler (see Tech Debt above).

---

## Missing Error Handling

**`beginAnswering` failure is unhandled at the call site:**
- `beginAnswering` is called via `tick()` → `await beginAnswering(room)`. If `generateQuestions` throws for all players, the exception propagates up through `tick()` and is swallowed by the `try/catch` in `room:start` / `restaurant:lock` handlers, which return a `fail()` ack to the triggering socket. Other players in the room receive no notification and the room gets stuck in `selecting` phase.
- Files: `server/src/flow.ts` (line 106), `server/src/rooms.ts` (lines 252–262)
- Fix approach: `beginAnswering` already falls back to mock questions on AI failure (`generateQuestions` has a try/catch). Ensure mock questions are always returned, never let the whole function throw.

**`candidatesForProfileLive` has no try/catch:**
- The live implementation in `server/src/services/placesService.ts` (line 131) does not catch HTTP errors. An exception would propagate to the `swipe:candidates` handler's `try/catch` and return `fail(...)`, but the client only shows a toast and stays on the swipe result screen with no candidates.
- Files: `server/src/services/placesService.ts` (lines 131–163)
- Fix approach: Wrap the function body in a try/catch that falls back to `candidatesForProfile` mock logic.

**Bot action errors inside `driveBots` are uncaught:**
- `driveBots` calls `submitVote(room, p.id, ranked)` for bots. If the ranked list is invalid (e.g. wrong length due to the hardcoded `3` issue), `submitVote` returns `{ error: '...' }` but `driveBots` ignores the return value. The bot is not marked as having voted, so `allVoted` never becomes true, and the game wedges until the phase timer fires.
- Files: `server/src/flow.ts` (lines 86–91)
- Fix approach: Check the return value of `submitVote` inside `driveBots` and log a warning; also fix the `slice(0, 3)` bug noted in Tech Debt.

**`room:reset` does not clear `deadlineTs` for all phases consistently:**
- `resetToLobby` in `rooms.ts` sets `room.deadlineTs = null`, and the `room:reset` handler calls `clearPhaseTimer` before `resetToLobby`. However, if `resetToLobby` is called while `beginAnswering` is in-flight (awaiting AI), the `deadlineTs` may be set again by `armTimer` inside `tick()` after the reset.
- Files: `server/src/socket.ts` (lines 217–227), `server/src/rooms.ts` (line 385)
- Impact: Edge case only; the stale timer would fire and call `getRoom`, find the room in `lobby` phase, and `forceAdvance` would be a no-op.

---

## Known Issues

**`swipe:cards` requires being in a room but does not check phase:**
- The `swipe:cards` handler at `server/src/socket.ts` line 140 checks `if (!room)` but does not check `room.phase`. A player can fetch swipe cards during `voting`, `leaderboard`, or `final` phases, triggering an unnecessary LLM call.

**`makeCode` is recursive without a depth limit:**
- `makeCode()` in `server/src/rooms.ts` (line 56–59) recurses if the generated code already exists. With 22 available letters and 4-character codes (22^4 = 234,256 combinations) and typical usage of a handful of concurrent rooms, collision probability is negligible. But at saturation the recursion would stack-overflow rather than fail gracefully.

**`rejoin` on "Home" screen does not attempt reconnect before showing "Rejoin" button:**
- `lastRoom` is shown as a "Rejoin XXXX" button regardless of whether the room still exists. Pressing it will fail with "Room not found" if the server restarted, but no proactive check happens on page load. The user is not notified until they click.

**Disconnect does not remove the player from the `timers` tracking:**
- When a player disconnects and all remaining connected players have acted, `allRestaurantsLocked` / `allAnswered` / `allVoted` filters on `p.connected` correctly. However, if the last remaining human disconnects mid-game, `driveBots` would still run on the next `tick()` call (there is none, since there's no triggering socket action). The phase timer will fire and force-advance correctly, but bots won't act until then. This is a minor latency issue, not a correctness bug.
