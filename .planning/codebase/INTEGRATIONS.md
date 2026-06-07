# INTEGRATIONS
_Last updated: 2026-06-07_

## Summary
The app integrates with two optional external APIs — Anthropic Claude (LLM) and Google Places API v1 — both accessed directly via `fetch` from the server. Both default to built-in mock data when API keys are absent, so the game runs fully offline. Deployment uses a split model: Vercel for the static client and Render for the backend.

---

## APIs & External Services

### Anthropic Claude (LLM)

- **Purpose:** Generates binary swipe cards ("this or that" trade-offs) and personalized comedic party game questions for each player
- **Endpoint:** `https://api.anthropic.com/v1/messages`
- **SDK/Client:** Raw `fetch` (no SDK); implemented in `server/src/services/aiService.ts`
- **Auth env var:** `LLM_API_KEY`
- **Model env var:** `LLM_MODEL` (default: `claude-haiku-4-5-20251001`)
- **API version header:** `anthropic-version: 2023-06-01`
- **Mock mode:** Enabled when `USE_MOCKS=true` OR `LLM_API_KEY` is not set; falls back to hardcoded swipe cards and question templates
- **Failure behavior:** Logs a warning and falls back to mock data on any HTTP or parse error

### Google Places API v1

- **Purpose:** Resolves a free-text restaurant name to a real nearby place (name, address, rating, price, map link), and finds candidate restaurants matching a player's swipe preference profile
- **Endpoints:**
  - `https://places.googleapis.com/v1/places:searchText` (POST) — for both text search and profile-based candidate search
- **SDK/Client:** Raw `fetch`; implemented in `server/src/services/placesService.ts`
- **Auth env var:** `PLACES_API_KEY` (passed as `X-Goog-Api-Key` header)
- **Field mask:** `places.id,places.displayName,places.formattedAddress,places.rating,places.priceLevel,places.googleMapsUri,places.primaryTypeDisplayName`
- **Mock mode:** Enabled when `USE_MOCKS=true` OR `PLACES_API_KEY` is not set; uses a hardcoded list of 12 sample restaurants with scoring heuristics
- **Location:** Browser geolocation (`navigator.geolocation`) provides lat/lng via `client/src/lib/geo.ts`; falls back to `DEFAULT_CITY` env var (default: `San Francisco`)

---

## Data Storage

**Databases:** None. All game state (rooms, players, phase, scores) is held in-memory on the server in `server/src/rooms.ts`. No persistence layer.

**File Storage:** None.

**Caching:** None. Rooms are reaped by a 30-minute interval timer in `server/src/index.ts`.

---

## Authentication & Identity

**Auth Provider:** None. No login or sessions.

**Player identity:** A UUID stored in browser `localStorage`, generated client-side in `client/src/lib/identity.ts` on first visit. Sent in every socket payload as `playerId`. This is intentionally trust-model-light — no signature or session token.

---

## Realtime Transport

- **Protocol:** WebSocket with polling fallback via Socket.IO ^4.7.5
- **Server entry:** `server/src/index.ts` — `new Server(httpServer, { cors: ... })`
- **Client entry:** `client/src/lib/socket.tsx` — `io(SERVER_URL, { transports: ['websocket', 'polling'] })`
- **Split deploy:** Client points at the Render backend via `VITE_SERVER_URL` build-time env var; same-origin fallback for local dev

---

## Monitoring & Observability

**Error Tracking:** None.

**Logs:** `console.log` / `console.warn` only; structured with `[where-to]` and `[aiService]` / `[placesService]` prefixes. No external log aggregator.

**Health check:** `GET /api/health` — returns `{ ok, mocks: { ai, places }, defaultCity }`. Used by Render blueprint for health-check probing.

---

## CI/CD & Deployment

### Vercel (client)

- Config: `vercel.json` at project root
- Framework: `vite`
- Build: `npm run build` → output at `client/dist/`
- SPA routing: all paths rewritten to `/index.html`
- Preview deploys on `*.vercel.app` are automatically allowed by the server CORS logic

### Render (backend)

- Config: `render.yaml` at project root
- Service type: `web`, runtime `node`, free plan
- Start: `npm start` (runs `tsx server/src/index.ts`)
- Health check path: `/api/health`
- `PORT` is set automatically by Render

**Single-service alternative:** If `client/dist/index.html` exists at startup, Express also serves the client statically (no Vercel needed).

---

## Environment Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `USE_MOCKS` | No | `true` | Master mock switch; when `true` disables all external API calls |
| `LLM_API_KEY` | No | — | Anthropic API key; absence forces AI mock mode |
| `LLM_MODEL` | No | `claude-haiku-4-5-20251001` | Anthropic model ID |
| `PLACES_API_KEY` | No | — | Google Places API v1 key; absence forces places mock mode |
| `DEFAULT_CITY` | No | `San Francisco` | Fallback city when player denies geolocation |
| `CLIENT_ORIGIN` | No | — | Comma-separated allowed browser origins for production CORS (split deploy) |
| `PORT` | No | `3001` | HTTP server port |
| `VITE_SERVER_URL` | No | `/` | Client-side: backend origin for split deploy (baked in at Vite build time) |
| `NODE_ENV` | No | `development` | Enables CORS restriction and prod logging when set to `production` |

---

## Webhooks & Callbacks

**Incoming:** None.

**Outgoing:** None.
