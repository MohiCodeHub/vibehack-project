// Socket.IO wiring: maps client events to the room engine and broadcasts state.

import type { Server, Socket } from 'socket.io';
import type { Ack, CreateRoomReq, JoinRoomReq, Restaurant, SwipeChoice } from '../../shared/types.ts';
import {
  createRoom,
  joinRoom,
  getRoom,
  markDisconnected,
  startGame,
  lockRestaurant,
  submitAnswers,
  submitVote,
  nextRound,
  resetToLobby,
  addBot,
  removeBot,
  serializeRoom,
  privateStateFor,
  type Room,
} from './rooms.ts';
import { tick, forceAdvance, clearPhaseTimer } from './flow.ts';
import { generateSwipeCards } from './services/aiService.ts';
import { resolveRestaurant, candidatesForProfile, type LatLng } from './services/placesService.ts';

/** Broadcast room state to everyone + each player's private slice. */
export function broadcast(io: Server, room: Room): void {
  const view = serializeRoom(room);
  io.to(room.code).emit('room:update', view);
  for (const p of room.players.values()) {
    if (p.socketId) {
      io.to(p.socketId).emit('private:update', privateStateFor(room, p.id));
    }
  }
}

const ok = <T>(data?: T): Ack<T> => ({ ok: true, data });
const fail = (error: string): Ack => ({ ok: false, error });

type Cb = (a: Ack) => void;
const noop: Cb = () => {};
/** Normalize socket.io args so a handler works whether or not a payload was sent. */
function args(a: unknown, b: unknown): { cb: Cb } {
  return { cb: (typeof a === 'function' ? a : b) as Cb ?? noop };
}

export function registerHandlers(io: Server, socket: Socket): void {
  // Track which room/player this socket belongs to for cleanup.
  let joinedCode: string | null = null;
  let myPlayerId: string | null = null;

  socket.on('room:create', async (req: CreateRoomReq, cb: (a: Ack) => void) => {
    try {
      if (!req.playerName?.trim()) return cb(fail('Name required'));
      const room = createRoom(req.outingType || 'Dinner', {
        id: req.playerId,
        name: req.playerName.trim().slice(0, 20),
        socketId: socket.id,
      });
      socket.join(room.code);
      joinedCode = room.code;
      myPlayerId = req.playerId;
      cb(ok({ code: room.code }));
      broadcast(io, room);
    } catch (e) {
      cb(fail((e as Error).message));
    }
  });

  socket.on('room:join', (req: JoinRoomReq, cb: (a: Ack) => void) => {
    if (!req.playerName?.trim()) return cb(fail('Name required'));
    if (!req.code?.trim()) return cb(fail('Code required'));
    const result = joinRoom(req.code, {
      id: req.playerId,
      name: req.playerName.trim().slice(0, 20),
      socketId: socket.id,
    });
    if ('error' in result) return cb(fail(result.error));
    socket.join(result.room.code);
    joinedCode = result.room.code;
    myPlayerId = result.player.id;
    cb(ok({ code: result.room.code, rejoined: result.rejoined }));
    broadcast(io, result.room);
  });

  socket.on('room:start', async (a: unknown, b: unknown) => {
    const { cb } = args(a, b);
    const room = joinedCode ? getRoom(joinedCode) : undefined;
    if (!room || !myPlayerId) return cb(fail('Not in a room'));
    const res = startGame(room, myPlayerId);
    if (res.error) return cb(fail(res.error));
    cb(ok());
    await tick(room); // bots lock their picks immediately
    broadcast(io, room);
  });

  // Host-only escape hatch: force the current phase forward when anything wedges (1b).
  socket.on('host:next', async (a: unknown, b: unknown) => {
    const { cb } = args(a, b);
    const room = joinedCode ? getRoom(joinedCode) : undefined;
    if (!room || !myPlayerId) return cb(fail('Not in a room'));
    if (myPlayerId !== room.hostId) return cb(fail('Only the host can skip'));
    if (room.phase === 'leaderboard') {
      const res = nextRound(room, myPlayerId);
      if (res.error) return cb(fail(res.error));
    } else if (room.phase === 'selecting' || room.phase === 'answering' || room.phase === 'voting') {
      forceAdvance(room);
    } else {
      return cb(fail('Nothing to skip here'));
    }
    cb(ok());
    await tick(room);
    broadcast(io, room);
  });

  // ---- test bots (solo / 1-player testing) ----

  socket.on('room:addBot', (a: unknown, b: unknown) => {
    const { cb } = args(a, b);
    const room = joinedCode ? getRoom(joinedCode) : undefined;
    if (!room || !myPlayerId) return cb(fail('Not in a room'));
    const res = addBot(room, myPlayerId);
    if (res.error) return cb(fail(res.error));
    cb(ok());
    broadcast(io, room);
  });

  socket.on('room:removeBot', (a: unknown, b: unknown) => {
    const { cb } = args(a, b);
    const room = joinedCode ? getRoom(joinedCode) : undefined;
    if (!room || !myPlayerId) return cb(fail('Not in a room'));
    const res = removeBot(room, myPlayerId);
    if (res.error) return cb(fail(res.error));
    cb(ok());
    broadcast(io, room);
  });

  // ---- restaurant selection ----

  socket.on('swipe:cards', async (a: unknown, b: unknown) => {
    const { cb } = args(a, b);
    const room = joinedCode ? getRoom(joinedCode) : undefined;
    if (!room) return cb(fail('Not in a room'));
    const cards = await generateSwipeCards(room.outingType);
    cb(ok({ cards }));
  });

  socket.on('swipe:candidates', async (payload: { choices: SwipeChoice[]; loc?: LatLng }, cb: (a: Ack) => void) => {
    try {
      const candidates = await candidatesForProfile(payload.choices ?? [], payload.loc);
      cb(ok({ candidates }));
    } catch (e) {
      cb(fail((e as Error).message));
    }
  });

  socket.on('restaurant:search', async (payload: { name: string; loc?: LatLng }, cb: (a: Ack) => void) => {
    try {
      const r = await resolveRestaurant(payload.name ?? '', payload.loc);
      cb(ok({ restaurant: r }));
    } catch (e) {
      cb(fail((e as Error).message));
    }
  });

  socket.on('restaurant:lock', async (payload: { restaurant: Restaurant }, cb: (a: Ack) => void) => {
    const room = joinedCode ? getRoom(joinedCode) : undefined;
    if (!room || !myPlayerId) return cb(fail('Not in a room'));
    const res = lockRestaurant(room, myPlayerId, payload.restaurant);
    if (res.error) return cb(fail(res.error));
    cb(ok());
    await tick(room); // advance to answering once everyone (incl. bots) has locked
    broadcast(io, room);
  });

  // ---- answering ----

  socket.on('answers:submit', async (payload: { answers: Record<string, string> }, cb: (a: Ack) => void) => {
    const room = joinedCode ? getRoom(joinedCode) : undefined;
    if (!room || !myPlayerId) return cb(fail('Not in a room'));
    const res = submitAnswers(room, myPlayerId, payload.answers ?? {});
    if (res.error) return cb(fail(res.error));
    cb(ok());
    await tick(room); // advance to voting once everyone has answered
    broadcast(io, room);
  });

  // ---- voting ----

  socket.on('vote:submit', async (payload: { ranked: string[] }, cb: (a: Ack) => void) => {
    const room = joinedCode ? getRoom(joinedCode) : undefined;
    if (!room || !myPlayerId) return cb(fail('Not in a room'));
    const res = submitVote(room, myPlayerId, payload.ranked ?? []);
    if (res.error) return cb(fail(res.error));
    cb(ok());
    await tick(room); // tally + show leaderboard once everyone has voted
    broadcast(io, room);
  });

  socket.on('round:next', async (a: unknown, b: unknown) => {
    const { cb } = args(a, b);
    const room = joinedCode ? getRoom(joinedCode) : undefined;
    if (!room || !myPlayerId) return cb(fail('Not in a room'));
    const res = nextRound(room, myPlayerId);
    if (res.error) return cb(fail(res.error));
    cb(ok());
    await tick(room); // bots vote the new round immediately
    broadcast(io, room);
  });

  socket.on('room:reset', (a: unknown, b: unknown) => {
    const { cb } = args(a, b);
    const room = joinedCode ? getRoom(joinedCode) : undefined;
    if (!room || !myPlayerId) return cb(fail('Not in a room'));
    const res = resetToLobby(room, myPlayerId);
    if (res.error) return cb(fail(res.error));
    clearPhaseTimer(room.code); // back to untimed lobby — drop any running countdown
    room.deadlineTs = null;
    cb(ok());
    broadcast(io, room);
  });

  socket.on('disconnect', () => {
    const room = markDisconnected(socket.id);
    if (room) broadcast(io, room);
  });
}
