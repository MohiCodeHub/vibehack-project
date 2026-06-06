# Progress — Backend Hardening

Tick these off as we go. Tasks mirror the 11 sections in `plan.md`.

## 1. Submit gate & phase transitions
- [ ] 1a. Advance on connected players (+ bots) only; disconnected can't block
- [ ] 1b. Host `host:next` force-advance event + "Skip / Next" button
- [ ] 1c. Server-authoritative phase timers with `deadlineTs` in `RoomView`
- [ ] 1d. Phase guards on every socket handler

## 2. Voting integrity (ranked top-3)
- [ ] 2a. `maxPicks(activeCount)` rule for 2 / 3 / 4+ players
- [ ] 2b. Server-side vote validation (phase, count, distinct, no self, real answers)
- [ ] 2c. Idempotent submission (overwrite, never double-count)

## 3. Input validation & safety
- [ ] Validate name / restaurant / answer lengths + room code regex
- [ ] 3a. Case-insensitive duplicate destination prevention

## 4. AI service hardening
- [ ] 4a. Timeout + try/catch + mock fallback on every LLM call
- [ ] 4b. Pre-generate questions during `selecting`, cache on player
- [ ] 4c. Defensive JSON parsing (strip fences, validate shape)

## 5. Places service hardening
- [ ] Timeout on Places call (5s)
- [ ] Cache by (query, lat, lng, radius)
- [ ] Free-text fallback on failure (never block the lock)
- [ ] Swipe-deck falls back to mock 12-restaurant list

## 6. Memory & room lifecycle
- [ ] Disconnect grace period (keep slot, `connected: false`)
- [ ] Room TTL: GC rooms with 0 connected humans > 10 min
- [ ] Timer cleanup on room destroy
- [ ] Bot timer cleanup on phase exit / destroy

## 7. Reconnect edge cases
- [ ] Prefer id match; name match only for a disconnected slot
- [ ] Rejoin in `final` → send final state + "game ended" flag
- [ ] Rejoin to missing room → `roomNotFound`, client clears storage

## 8. Bot robustness
- [ ] Bots use wrapped AI service with canned fallback
- [ ] Bot action errors are caught, never stop `tick()`
- [ ] Bot timers cleared on phase change / room destroy

## 9. Observability
- [ ] `[room:ABCD]` log prefix
- [ ] Dev-only `GET /api/rooms/:code/debug`
- [ ] `server:error` socket event → client toast

## 10. Render cold start
- [ ] Confirm Socket.IO `reconnection: true` + "waking server…" toast
- [ ] Health ping every 10 min while on home/lobby

## 11. Concurrency & races
- [ ] Re-fetch room + re-check phase after every `await` before mutating

## Smoke test (pre-demo)
- [ ] All 10 checks in plan.md "Backend smoke test" pass
