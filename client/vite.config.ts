import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Client lives in /client; output to /client/dist which the server serves in prod.
export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 5173,
    // Allow access from the Docker-hosted test browser during local verification.
    allowedHosts: ['host.docker.internal', 'localhost'],
    proxy: {
      // Proxy realtime + API to the Express/Socket.IO server during dev.
      '/socket.io': { target: 'http://localhost:3001', ws: true },
      '/api': { target: 'http://localhost:3001' },
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
});
