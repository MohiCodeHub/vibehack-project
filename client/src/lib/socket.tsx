// Socket singleton + React context exposing room/private state and typed emits.

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { RoomView, PrivateState, Ack } from '@shared/types.ts';
import { getPlayerId } from './identity.ts';

interface SocketCtx {
  socket: Socket;
  connected: boolean;
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
  const [room, setRoom] = useState<RoomView | null>(null);
  const [priv, setPriv] = useState<PrivateState | null>(null);

  if (!socketRef.current) {
    // Same-origin in prod; Vite proxy handles dev.
    socketRef.current = io({ autoConnect: true, transports: ['websocket', 'polling'] });
  }
  const socket = socketRef.current;

  useEffect(() => {
    const onConnect = () => setConnected(true);
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
          socket.emit(event, payload, (ack: Ack<T>) => resolve(ack ?? { ok: false, error: 'no ack' }));
        }),
    [socket],
  );

  const value: SocketCtx = { socket, connected, room, priv, playerId, emit, setRoom };
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
