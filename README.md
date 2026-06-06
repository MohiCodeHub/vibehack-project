# Where To? 🍴

A real-time, **Jackbox-style multiplayer party game** that helps a group decide where to go
out (starting with dinner). Each player champions a restaurant, then everyone plays a 3-round
answer-and-vote game. **The winner's restaurant becomes the group's decision.**

Mobile-first — every player plays on their own phone (works great on iPhone Safari). A shared
screen is optional.

---

## How it plays

1. **Lobby** — Host taps *Create Room*, gets a 4-letter code. Friends *Join Room* with the code
   + a name. Everyone appears in the lobby in real time. Host taps *Start* at 2+ players.
2. **Champion a restaurant** — each player either types a pick (resolved to a real nearby place)
   or hits *Help me decide* and swipes through binary trade-off cards to get 3–4 AI-matched
   candidates.
3. **Answer** — everyone gets 3 comedic, restaurant-aware questions to answer on their phone.
4. **Vote (×3 rounds)** — each round shows everyone's answers; you pick your top 3
   (🥇 +3 / 🥈 +2 / 🥉 +1). Can't vote for yourself. Animated leaderboard between rounds.
5. **Result** — *"Where you're going: [Restaurant]"* — the 1st-place player's pick, with details
   + a map link.

Supports **2–6 players**.

---

## Tech

| Layer    | Choice |
|----------|--------|
| Frontend | React + Vite + TypeScript, mobile-first CSS |
| Backend  | Node + Express + **Socket.IO** (rooms + reconnect) |
| State    | **In-memory** room state, keyed by 4-letter code (no DB) |
| AI       | LLM behind `server/src/services/aiService.ts` (mockable) |
| Places   | Google Places v1 behind `server/src/services/placesService.ts` (mockable) |

Both external services are **fully mockable** — set `USE_MOCKS=true` (the default when no API
keys are present) and the entire game runs end-to-end with zero network calls. Essential for
reliable demos.

---

## Run locally

```bash
npm install
cp .env.example .env        # defaults to USE_MOCKS=true — works offline immediately
npm run dev                 # server on :3001, client on :5173 (proxied)
```

Open <http://localhost:5173> on your laptop, and on your phone (same Wi-Fi) open
`http://<your-laptop-ip>:5173`. Create a room on one, join from the others.

### Solo / 1-player test mode 🤖

You don't need a group to try the whole game. In the lobby, the host can tap **+ Add test bot**
(up to 6 players total). Bots are server-driven — they automatically lock a restaurant, answer
their questions, and cast votes — so a **single human can play through every phase alone**. Add
one or two bots, hit **Start**, and play normally; the game waits only on you.

Verify it headlessly:

```bash
node scripts/simulate-solo.mjs    # one human + 2 bots, asserts every phase → ✅ SOLO FLOW PASSED
```

### Test the full flow (3 simulated players)

```bash
# in one terminal:
USE_MOCKS=true npx tsx server/src/index.ts
# in another:
node scripts/simulate.mjs
```

Drives create → join → reconnect → select (manual + swipe) → answer → 3 voting rounds →
final result, asserting every state transition syncs. Prints `✅ FULL FLOW PASSED`.

### Other scripts

```bash
npm run typecheck   # tsc on both server and client
npm run build       # build the client into client/dist
npm start           # production: serve API + built client from one process on $PORT
```

---

## Environment variables

| Var             | Default            | Purpose |
|-----------------|--------------------|---------|
| `USE_MOCKS`     | `true` if keys absent | Run AI + places fully mocked (no external calls). |
| `LLM_API_KEY`   | —                  | Anthropic key for swipe cards + comedic questions. Blank → AI mocked. |
| `LLM_MODEL`     | `claude-haiku-4-5-20251001` | LLM model id. |
| `PLACES_API_KEY`| —                  | Google Places API v1 key. Blank → places mocked. |
| `DEFAULT_CITY`  | `San Francisco`    | Fallback location when a player denies geolocation. |
| `PORT`          | `3001`             | HTTP/WebSocket port (platforms set this automatically). |

Each service mocks **independently** — e.g. real AI questions + mocked places is fine.

---

## Deploy — Vercel (client) + Render (backend)

The recommended topology: **Vercel** serves the static React client (CDN), and **Render** runs
the realtime backend (Express + Socket.IO) which holds all room state. The client opens a
WebSocket directly to the Render backend. See [`docs/backend-architecture.md`](docs/backend-architecture.md)
for the full design.

> The app also still runs as a **single service** anywhere (the server serves `client/dist` when
> it's present) — handy for one-box hosts. The split below is the primary path.

### 1. Backend on Render (API + WebSockets)

A Blueprint is included ([`render.yaml`](render.yaml)):

1. Render → **New +** → **Blueprint**, pick this repo. It provisions a free Web Service:
   build `npm install`, start `npm start`, health check `/api/health`.
2. Set env vars in the dashboard:
   - `USE_MOCKS=true` (or `false` + `LLM_API_KEY` / `PLACES_API_KEY` for real AI/Places)
   - `DEFAULT_CITY` (e.g. `San Francisco`)
   - `CLIENT_ORIGIN` = your Vercel URL, e.g. `https://where-to.vercel.app` (no trailing slash;
     `*.vercel.app` preview deploys are allowed automatically)
3. Note the service URL, e.g. `https://where-to-api.onrender.com`.

> Backend-only build doesn't compile the client, so `NODE_ENV=production` at install is fine here
> (`tsx` is a runtime dependency).

### 2. Client on Vercel (static SPA)

[`vercel.json`](vercel.json) configures the Vite build + SPA routing:

1. Vercel → **New Project**, import this repo (root). It auto-detects the config.
2. Set one env var: `VITE_SERVER_URL` = your Render URL from step 1
   (e.g. `https://where-to-api.onrender.com`). It's **build-time** — redeploy after changing it.
3. Deploy. Vercel installs devDependencies and runs `npm run build` → `client/dist`.

> Don't set `NODE_ENV=production` on Vercel — the build needs devDependencies (Vite/React/TS).

### 3. Free-tier note ⚠️ (single-room demos)

Render's free tier **sleeps after ~15 min idle** and cold-starts in ~30–60s, **wiping in-memory
rooms** on sleep/redeploy. For a single-room demo this is usually fine — the client shows a
"waking the server up…" message on first connect, and reconnects rebind players to their slots.

To avoid cold starts during an event, keep the backend warm with a free uptime pinger
(UptimeRobot / cron-job.org) hitting `https://<your-render-url>/api/health` every ~10 minutes.
(State still resets on redeploy — don't push mid-game.)

---

## Architecture notes

- **Sync model:** the server holds authoritative room state; every transition broadcasts a
  sanitized `RoomView` to the room plus a per-player `PrivateState` (your questions, your pick).
  Answers stay private until the voting phase.
- **Reconnect:** clients carry a persistent `playerId` in `localStorage`. On a transport drop the
  client auto-re-emits `room:join`, and the server's same-id path rebinds the new socket to the
  existing slot — no duplicates, score intact. Host migrates to the next connected human if the
  host drops.
- **Cross-origin:** the client connects to `VITE_SERVER_URL` (the Render backend) when set, else
  same-origin. The backend allows browser origins via the `CLIENT_ORIGIN` allowlist (plus
  `*.vercel.app`).
- **Auto vs. manual gates:** auto-advance when waiting on *all-players-submitted*
  (locked-in, answered, voted); host gates the deliberate steps (*Start*, *Next round*).
- **Services:** all AI/places access is isolated behind two modules with mock + live
  implementations, switched by `USE_MOCKS`.

Shared protocol types live in `shared/types.ts` and are imported by both sides.
