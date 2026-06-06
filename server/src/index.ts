// Entry point: Express serves the built client + health check; Socket.IO handles realtime.

import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Server } from 'socket.io';
import { registerHandlers } from './socket.ts';
import { reapRooms } from './rooms.ts';
import { aiConfig } from './services/aiService.ts';
import { placesConfig } from './services/placesService.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const isProd = process.env.NODE_ENV === 'production';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: isProd ? undefined : { origin: true, credentials: true },
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mocks: { ai: aiConfig.USE_MOCKS, places: placesConfig.USE_MOCKS },
    defaultCity: placesConfig.DEFAULT_CITY,
  });
});

// Expose runtime config the client needs (default city, etc.).
app.get('/api/config', (_req, res) => {
  res.json({ defaultCity: placesConfig.DEFAULT_CITY });
});

// Serve the built client in production (single-service deploy).
if (isProd) {
  const clientDist = path.resolve(__dirname, '../../client/dist');
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
  console.log(`[where-to] mocks → ai:${aiConfig.USE_MOCKS} places:${placesConfig.USE_MOCKS}`);
});
