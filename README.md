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

## Deploy (single service: API + built client)

The server serves the built client from `client/dist` in production, so one web service does
everything.

**Build command:** `npm install && npm run build`
**Start command:** `npm start`

### Render
1. New → **Web Service**, connect the repo.
2. Build: `npm install && npm run build` · Start: `npm start`
3. Env: set `USE_MOCKS=true` (or add `LLM_API_KEY` / `PLACES_API_KEY` and set `USE_MOCKS=false`),
   plus `DEFAULT_CITY`. `PORT` is injected by Render.

### Railway
1. New Project → **Deploy from repo**.
2. Railway auto-detects Node. Set Build `npm run build`, Start `npm start`.
3. Add the same env vars. `PORT` is injected.

### Fly.io
```bash
fly launch --no-deploy           # generates fly.toml; set internal_port = 3001
fly secrets set USE_MOCKS=true DEFAULT_CITY="San Francisco"
fly deploy
```

> Whichever platform: keep `npm run build` in the build step (it needs devDependencies — don't
> set `NODE_ENV=production` during install, or Vite/TS won't be available to build the client).

---

## Architecture notes

- **Sync model:** the server holds authoritative room state; every transition broadcasts a
  sanitized `RoomView` to the room plus a per-player `PrivateState` (your questions, your pick).
  Answers stay private until the voting phase.
- **Reconnect:** clients carry a persistent `playerId` in `localStorage`. Rejoining with the same
  id (or the same name) restores your slot — no duplicates, score intact. Host migrates to the
  next connected player if the host drops.
- **Auto vs. manual gates:** auto-advance when waiting on *all-players-submitted*
  (locked-in, answered, voted); host gates the deliberate steps (*Start*, *Next round*).
- **Services:** all AI/places access is isolated behind two modules with mock + live
  implementations, switched by `USE_MOCKS`.

Shared protocol types live in `shared/types.ts` and are imported by both sides.
