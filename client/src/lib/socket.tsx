// Socket singleton + React context exposing room/private state and typed emits.

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { RoomView, PrivateState, Ack } from '@shared/types.ts';
import { getPlayerId } from './identity.ts';

// In split deploy (Vercel client + Render backend) the backend lives on another
// origin — point at it via VITE_SERVER_URL (baked in at build time). Falls back to
// same-origin for local single-service dev (Vite proxies /socket.io).
const SERVER_URL = import.meta.env.VITE_SERVER_URL || '/';

interface SocketCtx {
  socket: Socket;
  connected: boolean;
  /** True once we've connected at least once (distinguishes first connect from reconnect). */
  everConnected: boolean;
  room: RoomView | null;
  priv: PrivateState | null;
  playerId: string;
  /** Promise-based emit that resolves with the server ack. */
  emit: <T = unknown>(event: string, payload?: unknown) => Promise<Ack<T>>;
  setRoom: (r: RoomView | null) => void;
}

const Ctx = createContext<SocketCtx | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const playerId = getPlayerId();
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [everConnected, setEverConnected] = useState(false);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [priv, setPriv] = useState<PrivateState | null>(null);

  // The room we're actively in, so we can re-bind our socket after a reconnect.
  const activeJoin = useRef<{ code: string; name: string; playerId: string } | null>(null);
  const hasConnectedBefore = useRef(false);

  if (!socketRef.current) {
    socketRef.current = io(SERVER_URL, { autoConnect: true, transports: ['websocket', 'polling'] });
  }
  const socket = socketRef.current;

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      setEverConnected(true);
      // On a *reconnect* (new socket id after a drop), the server's per-socket binding
      // is gone — re-emit join so it rebinds us to our existing slot + resumes private state.
      if (hasConnectedBefore.current && activeJoin.current) {
        const a = activeJoin.current;
        socket.emit('room:join', { code: a.code, playerName: a.name, playerId: a.playerId }, () => {});
      }
      hasConnectedBefore.current = true;
    };
    const onDisconnect = () => setConnected(false);
    const onRoom = (r: RoomView) => setRoom(r);
    const onPriv = (p: PrivateState) => setPriv(p);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:update', onRoom);
    socket.on('private:update', onPriv);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:update', onRoom);
      socket.off('private:update', onPriv);
    };
  }, [socket]);

  const emit = useMemo(
    () =>
      <T,>(event: string, payload?: unknown) =>
        new Promise<Ack<T>>((resolve) => {
          socket.emit(event, payload, (ack: Ack<T>) => {
            // Remember the room we joined/created so we can auto-rejoin on reconnect.
            if (ack?.ok && (event === 'room:create' || event === 'room:join')) {
              const p = (payload ?? {}) as { code?: string; playerName?: string; playerId?: string };
              const data = (ack as Ack<{ code?: string }>).data;
              const code = (event === 'room:create' ? data?.code : p.code) ?? data?.code;
              if (code && p.playerName && p.playerId) {
                activeJoin.current = { code: code.toUpperCase(), name: p.playerName, playerId: p.playerId };
              }
            }
            resolve(ack ?? { ok: false, error: 'no ack' });
          });
        }),
    [socket],
  );

  const value: SocketCtx = { socket, connected, everConnected, room, priv, playerId, emit, setRoom };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGame(): SocketCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useGame must be used within SocketProvider');
  return ctx;
}

/** Convenience: find my player view in the current room. */
export function useMe() {
  const { room, playerId } = useGame();
  return room?.players.find((p) => p.id === playerId) ?? null;
}
