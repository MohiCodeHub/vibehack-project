# STACK
_Last updated: 2026-06-07_

## Summary
"Where To?" is a real-time multiplayer party game built as a TypeScript monorepo with a React/Vite frontend and an Express/Socket.IO backend. Both client and server share types from a `shared/` directory. There is no database — all game state is held in-memory on the server.

---

## Languages

**Primary:**
- TypeScript 5.5 — all source files in `server/src/`, `client/src/`, and `shared/`

**Target:**
- Server: ES2022 modules (run directly via `tsx`)
- Client: ESNext modules (bundled by Vite)

---

## Runtime

**Environment:**
- Node.js >=18 (specified in `package.json` `engines`)
- `tsx` ^4.16.2 — runs TypeScript server files directly without a compile step

**Package Manager:**
- npm (scripts use `npm run`; no bun/yarn/pnpm lockfile present)
- Lockfile: `package-lock.json` (standard npm)

---

## Frameworks

**Backend:**
- Express ^4.19.2 — HTTP server, health endpoint (`/api/health`), config endpoint (`/api/config`), and static file serving
- Socket.IO ^4.7.5 — WebSocket/polling-based realtime layer; all game events exchanged over named socket events

**Frontend:**
- React ^18.3.1 — UI library
- React DOM ^18.3.0 — DOM renderer
- Vite ^5.3.3 — dev server (port 5173) and production bundler; configured at `client/vite.config.ts`
- `@vitejs/plugin-react` ^4.3.1 — JSX transform + HMR

**Animation / UI Effects:**
- motion ^12.40.0 (Framer Motion v12) — page and component animations
- canvas-confetti ^1.9.4 — confetti burst on game end

**Icons:**
- lucide-react ^1.17.0 — icon components

---

## Key Dependencies

**Critical:**
- `socket.io` ^4.7.5 — server-side WebSocket engine; all game phase transitions and state sync
- `socket.io-client` ^4.7.5 — client-side counterpart, imported in `client/src/lib/socket.tsx`
- `dotenv` ^16.4.5 — loads `.env` into `process.env` at server startup (`server/src/index.ts`)
- `tsx` ^4.16.2 — enables `ts` imports and `watch` mode for server without a build step
- `cross-env` ^7.0.3 — cross-platform `NODE_ENV` injection in npm scripts

**Dev/Build:**
- `concurrently` ^8.2.2 — runs server and client dev processes in parallel (`npm run dev`)
- TypeScript ^5.5.3
- `@types/express`, `@types/node`, `@types/react`, `@types/react-dom`, `@types/canvas-confetti`

---

## Styling

- Custom CSS design system: `client/src/styles/tokens.css` (CSS custom properties), `client/src/styles/app.css`, `client/src/styles/fonts.css`
- No Tailwind, no CSS-in-JS library
- Custom `cn()` utility in `client/src/components/ui/utils.ts` (manual class joining, no `clsx` dependency)
- UI primitives are hand-built in `client/src/components/ui/` (Button, Card, Input, Badge, etc.)

---

## Build / Dev Configuration

**Config files:**
- `client/vite.config.ts` — Vite config; path alias `@shared` → `../shared`; dev proxy for `/socket.io` and `/api` to `localhost:3001`
- `client/tsconfig.json` — strict TypeScript, Bundler module resolution
- `server/tsconfig.json` — strict TypeScript, ES2022 target, Node types

**Build commands:**
```bash
npm run dev          # concurrently: tsx watch server + vite client
npm run build        # vite build → client/dist
npm start            # tsx server/src/index.ts (production)
npm run typecheck    # tsc --noEmit for both server and client
```

**Output:**
- Client static assets: `client/dist/`
- No server build artifact — server runs via `tsx` at runtime

---

## Platform Requirements

**Development:**
- Node.js >=18
- npm

**Production:**
- Node.js >=18
- Server runs via `tsx` (no pre-compilation required)
- Client static files served from `client/dist/` by Express (single-service) or from Vercel CDN (split deploy)
