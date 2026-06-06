# Backend Architecture — Split Deploy (Vercel + Render)

> Status: **draft / high-level overview.** Target: real players joining rooms over the
> public internet, frontend on Vercel, realtime backend on Render.

---

## 1. Topology

```
            ┌─────────────────────────┐
            │  Vercel (static CDN)     │   build: npm run build → client/dist
  Browser ──▶  React SPA (index.html) │   no server runtime, no game state
            └───────────┬─────────────┘
                        │  (1) load app over HTTPS
                        │
   players' phones      │  (2) open ONE WebSocket per client (cross-origin)
                        ▼
            ┌─────────────────────────┐
            │  Render (Web Service)    │   long-running Node process
            │  Express + Socket.IO     │   ◀── AUTHORITATIVE in-memory room state
            │  rooms: Map<code, Room>  │   ◀── all AI / Places calls (keys here only)
            └─────────────────────────┘
```

**Core principle:** the realtime backend must be a *single, persistent, stateful process*.
Game rooms live in RAM and every player holds a long-lived WebSocket to it.

**Why not put the backend on Vercel too?** Vercel's serverless/edge functions are
short-lived and stateless — they cannot hold an in-memory `rooms` map or keep a WebSocket
open across requests. So Vercel hosts **only** the static client; Render owns **all** state
and connections. This is the whole reason for the split.

---

## 2. Connection model (the main change from today)

Today: `client/src/lib/socket.tsx` calls `io()` with no URL → connects same-origin, and
`client/vite.config.ts` proxies `/socket.io` to `:3001` **in dev only**. On Vercel there is
no backend at the same origin, so this must change.

Split-deploy connection:

- Client connects to an **absolute backend URL** injected at build time:
  - `VITE_SERVER_URL=https://where-to-api.onrender.com`
  - `io(import.meta.env.VITE_SERVER_URL ?? '/', { transports: ['websocket', 'polling'] })`
  - The `?? '/'` keeps local single-service mode working unchanged.
- Transport: native **WebSocket**, with automatic fallback to **HTTP long-polling** if a
  network blocks WS (some corporate/captive Wi-Fi). Render supports native WS — no special
  config. Socket.IO handles the upgrade + fallback for us.
- One socket per client for the whole session; all game events multiplex over it.

---

## 3. CORS / origin allowlist

`server/src/index.ts` currently locks CORS down in production (`cors: undefined`). Once the
client is on a *different* origin, the backend must explicitly allow it.

- Drive an allowlist from env: `CLIENT_ORIGIN` (comma-separated), applied to **both** Express
  and the Socket.IO server.
- Include: the production Vercel domain (and any custom domain) **plus** preview deploys
  (`https://*.vercel.app`) via a small regex matcher.
- **Credentials:** none needed. Identity is a `playerId` carried in localStorage and sent in
  socket payloads — there are no auth cookies — so keep `credentials: false` (simpler, no
  cookie/SameSite headaches).

---

## 4. State & instance model

- The in-memory `rooms` Map (server/src/rooms.ts) is the single source of truth. Perfect for
  the target scale (groups of friends); state per room is tiny and traffic is bursty.
- **Hard constraint: exactly ONE backend instance.** Two Render instances would each have a
  *separate* rooms map — a player routed to instance B can't see a room created on instance A.
  So pin Render scaling to **1 instance** for now.
- Scaling beyond one instance is a deliberate, separate step (§8) — not needed yet.

---

## 5. Render free-tier caveat ⚠️ (decides whether real games survive)

Free Render web services **spin down after ~15 min idle** and **cold-start (~30–60s)** on the
next request. Two consequences that directly hit "people joining rooms":

1. The first player to wake a cold backend waits ~30–60s for their socket to connect.
2. **All in-memory rooms are wiped** on spin-down, restart, or redeploy → an in-progress
   game dies and codes stop working.

Mitigations, in order of preference:

- **Use the cheapest always-on paid Render instance** for any real event or live demo.
  Removes spin-down + cold starts entirely. **Recommended.**
- On free tier: keep it warm with an external pinger (UptimeRobot / cron-job.org hitting
  `/api/health` every ~10 min). Avoids cold starts but does **not** save state across redeploys.
- Client UX: surface a clear "waking the server up…" state during the initial connect (extend
  the existing `ConnBadge` reconnecting indicator) so a 30s cold start doesn't look broken.

> For a base/demo version, in-memory is the right call. If games must survive restarts, that's
> the trigger to add a shared store (§8) — a real architectural step, not a config flag.

---

## 6. Reconnection over the internet (one real gap to close)

The server is already reconnect-aware: persistent `playerId`, `joinRoom()` restores the slot on
a matching id, and host migrates off a dropped host. Socket.IO auto-reconnects with backoff.

**Gap:** the per-socket handlers bind `joinedCode` / `myPlayerId` in a closure
(server/src/socket.ts). When Socket.IO reconnects it creates a **new socket id**, so those
closure vars start empty — the player is still in room *state*, but their new socket isn't
bound to it, and their `private:update` stops flowing.

**Fix (client-side handshake):** on every `socket.on('connect')` *after the first*, if the
client has a stored `{ code, name, playerId }`, automatically re-emit `room:join`. The server's
existing same-id reconnect path rebinds the new socket, flips `connected` back on, and
re-sends private state. Net effect: a phone that backgrounds, drops Wi-Fi, or sleeps rejoins
seamlessly with score and slot intact.

(Optional hardening: Socket.IO "Connection State Recovery" can restore a session within a short
window, but the explicit re-join above is more robust given our closure-based binding and is
the recommended approach.)

---

## 7. Security & abuse (now that it's public)

- **Input validation/caps:** already truncating names/answers; audit every socket payload for
  type + length on the server (never trust the client).
- **Rate limiting:** add light per-IP / per-socket throttling on `room:create` and `room:join`
  to stop spam and code-guessing floods.
- **Room codes:** 24⁴ ≈ 331k combos (I/O excluded). Fine for ephemeral rooms; bump to 5 chars
  if guessing becomes a concern.
- **Secrets stay server-side:** `LLM_API_KEY` / `PLACES_API_KEY` live only on Render; the
  client never calls those APIs directly (already true — all AI/Places access is server-side).
- **Resource guards:** cap max concurrent rooms, max players/room (already 6), and reap stale
  rooms (already via `reapRooms`). Add a global room cap as a backstop.

---

## 8. Scaling path (documented, NOT for now)

If one instance is ever outgrown:

- Add `@socket.io/redis-adapter` + Redis (Render Redis / Upstash) so broadcasts fan out across
  instances.
- That alone isn't enough — room *state* is still per-instance. Two correct options:
  - **Sticky sessions by room code** (route all of a room's players to one instance), or
  - **Move authoritative room state into Redis** (bigger change).
- Recommendation: stay single-instance until concurrency genuinely demands otherwise. One
  modest Render instance handles many small rooms comfortably.

---

## 9. Health & ops

- **Health check:** point Render's health check at the existing `GET /api/health`.
- **Env vars**
  - Render (backend): `USE_MOCKS`, `LLM_API_KEY`, `PLACES_API_KEY`, `DEFAULT_CITY`,
    `CLIENT_ORIGIN`, `PORT` (auto-injected).
  - Vercel (frontend): `VITE_SERVER_URL` — **build-time**, baked into the static bundle, so a
    change requires a redeploy.
- **Logging:** structured connect / disconnect / room-lifecycle logs to read Render's tail.

---

## 10. Concrete code changes to enable the split

1. **Client** (`socket.tsx`): connect to `VITE_SERVER_URL` (absolute) with same-origin
   fallback for local dev.
2. **Client** (`socket.tsx`): add the auto-rejoin handshake on reconnect (§6).
3. **Server** (`index.ts`): apply a `CLIENT_ORIGIN`-driven CORS allowlist in **production**
   too, to both Express and Socket.IO.
4. **Server**: keep static-serving of `client/dist` behind a flag (harmless locally; unused in
   split deploy since Vercel serves the client).
5. **Vercel**: project = repo root, build `npm run build`, output `client/dist`, SPA rewrite to
   `index.html`, env `VITE_SERVER_URL`. No API/functions on Vercel.
6. **Render**: Web Service, build `npm install`, start `npm start`, scaling = 1 instance, env
   vars per §9.
7. **Light hardening**: payload validation + basic rate limiting on create/join (§7).

> Items 1–3 are the **minimum** to make cross-origin play work at all. 5–6 are deployment
> wiring. 4 and 7 are robustness.

---

## 11. Happy-path data flow

1. Browser → Vercel CDN: loads the SPA.
2. SPA reads `VITE_SERVER_URL` → opens a CORS-approved Socket.IO connection to Render (WS
   upgrade).
3. Host emits `room:create` → Render makes the room in memory, returns the 4-letter code,
   broadcasts lobby state.
4. Friends load the SPA from Vercel, connect to Render, emit `room:join { code }` → join the
   **same** in-memory room; everyone sees the live player list.
5. All gameplay events flow over each client's single WebSocket to the one Render instance.
6. A drop/reconnect triggers the auto-rejoin handshake (§6), rebinding the new socket to the
   existing player slot — score and position preserved.
```
