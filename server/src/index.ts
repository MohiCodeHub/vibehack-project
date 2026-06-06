// Entry point: Express serves the built client (single-service) OR runs API-only
// (split deploy). Socket.IO handles realtime; CORS is allowlist-driven in prod.

import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { Server } from 'socket.io';
import { registerHandlers } from './socket.ts';
import { reapRooms } from './rooms.ts';
import { aiConfig } from './services/aiService.ts';
import { placesConfig } from './services/placesService.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const isProd = process.env.NODE_ENV === 'production';

// Allowed browser origins for cross-origin (Vercel client → Render backend).
// Comma-separated exact origins, plus any *.vercel.app preview deploy.
const ALLOWED_ORIGINS = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true; // same-origin, curl, server-to-server
  if (!isProd) return true; // dev: allow everything
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    if (new URL(origin).hostname.endsWith('.vercel.app')) return true; // preview deploys
  } catch {
    /* ignore malformed origin */
  }
  return false;
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
    credentials: false, // identity is a localStorage playerId in payloads, not a cookie
  },
});

// CORS for the plain HTTP endpoints (health/config) when hit cross-origin.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mocks: { ai: aiConfig.USE_MOCKS, places: placesConfig.USE_MOCKS },
    defaultCity: placesConfig.DEFAULT_CITY,
  });
});

// Expose runtime config the client may need (default city, etc.).
app.get('/api/config', (_req, res) => {
  res.json({ defaultCity: placesConfig.DEFAULT_CITY });
});

// Serve the built client ONLY when it exists (single-service local/prod). In a
// split deploy the client is on Vercel, so client/dist is absent here and we run API-only.
const clientDist = path.resolve(__dirname, '../../client/dist');
const serveClient = fs.existsSync(path.join(clientDist, 'index.html'));
if (serveClient) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

io.on('connection', (socket) => {
  registerHandlers(io, socket);
});

// Periodically clean up abandoned rooms.
setInterval(() => reapRooms(), 1000 * 60 * 30);

httpServer.listen(PORT, () => {
  console.log(`[where-to] listening on :${PORT}  (NODE_ENV=${process.env.NODE_ENV ?? 'development'})`);
  console.log(`[where-to] mode: ${serveClient ? 'single-service (serving client)' : 'API-only (split deploy)'}`);
  console.log(`[where-to] mocks → ai:${aiConfig.USE_MOCKS} places:${placesConfig.USE_MOCKS}`);
  if (isProd) console.log(`[where-to] CORS allowlist: ${ALLOWED_ORIGINS.join(', ') || '(none set)'} + *.vercel.app`);
});
