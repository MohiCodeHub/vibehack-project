// In-memory room + game state engine. No DB. Rooms keyed by 4-letter code.

import type {
  Phase,
  Restaurant,
  Question,
  RoomView,
  PlayerView,
  VoteCard,
  PrivateState,
} from '../../shared/types.ts';
import { maxPicks } from '../../shared/types.ts';
import { generateRoundPrompts, type RoundPrompt } from './services/aiService.ts';

export const TOTAL_ROUNDS = 3;

interface Player {
  id: string; // persistent client-generated id (survives reconnect)
  name: string;
  socketId: string | null; // current socket, null when disconnected
  connected: boolean;
  isHost: boolean;
  /** Server-driven test bot (locks/answers/votes automatically). */
  isBot: boolean;
  restaurant?: Restaurant;
  /** This player's per-round questions — the shared room prompts, copied in at answering time. */
  questions: Question[];
  /** questionId -> answer text */
  answers: Record<string, string>;
  /** per round: ranked list of authorIds this player voted for (index 0 = top). */
  votes: Record<number, string[]>;
  score: number;
}

interface Room {
  code: string;
  outingType: string;
  /** Optional group decision topic set by host in lobby. */
  decisionTopic?: string;
  phase: Phase;
  hostId: string;
  players: Map<string, Player>;
  /** insertion order for stable display */
  order: string[];
  round: number; // current voting round
  createdAt: number;
  /** Deadline (epoch ms) for the current timed phase, or null when untimed. */
  deadlineTs: number | null;
  /** The 3 shared, category-based round prompts (generated once from outingType). */
  prompts?: RoundPrompt[];
  /** In-flight prompt generation, so beginAnswering can await a pre-gen already running. */
  promptsPromise?: Promise<void>;
  winner?: { playerName: string; restaurant: Restaurant };
}

const rooms = new Map<string, Room>();

// ---- code generation ----

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid confusion
function makeCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return rooms.has(code) ? makeCode() : code;
}

// ---- room lifecycle ----

export function createRoom(
  outingType: string,
  host: { id: string; name: string; socketId: string },
  decisionTopic?: string,
): Room {
  const code = makeCode();
  const room: Room = {
    code,
    outingType,
    decisionTopic: decisionTopic || undefined,
    phase: 'lobby',
    hostId: host.id,
    players: new Map(),
    order: [],
    round: 0,
    createdAt: Date.now(),
    deadlineTs: null,
  };
  rooms.set(code, room);
  addPlayer(room, { ...host, isHost: true });
  return room;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

function addPlayer(
  room: Room,
  p: { id: string; name: string; socketId: string | null; isHost?: boolean; isBot?: boolean },
): Player {
  const player: Player = {
    id: p.id,
    name: p.name,
    socketId: p.socketId,
    connected: true,
    isHost: !!p.isHost,
    isBot: !!p.isBot,
    questions: [],
    answers: {},
    votes: {},
    score: 0,
  };
  room.players.set(p.id, player);
  room.order.push(p.id);
  return player;
}

export interface JoinResult {
  room: Room;
  player: Player;
  rejoined: boolean;
}

/**
 * Join a room. Reconnect-aware: matching playerId (or, as a fallback, an exact
 * name match of a disconnected player) restores the existing slot.
 */
export function joinRoom(
  code: string,
  p: { id: string; name: string; socketId: string },
): { error: string } | JoinResult {
  const room = getRoom(code);
  if (!room) return { error: 'Room not found' };

  // 1) Exact playerId match → reconnect to the same slot.
  const byId = room.players.get(p.id);
  if (byId) {
    byId.socketId = p.socketId;
    byId.connected = true;
    byId.name = p.name || byId.name;
    return { room, player: byId, rejoined: true };
  }

  // 2) Name match of a disconnected player → reclaim slot (handles new device / cleared storage).
  const byName = [...room.players.values()].find(
    (pl) => !pl.connected && pl.name.toLowerCase() === p.name.toLowerCase(),
  );
  if (byName) {
    // remap to the new playerId
    room.players.delete(byName.id);
    const oldId = byName.id;
    byName.id = p.id;
    byName.socketId = p.socketId;
    byName.connected = true;
    room.players.set(p.id, byName);
    room.order = room.order.map((id) => (id === oldId ? p.id : id));
    if (room.hostId === oldId) room.hostId = p.id;
    return { room, player: byName, rejoined: true };
  }

  // 3) New player — only allowed in the lobby.
  if (room.phase !== 'lobby') return { error: 'Game already in progress' };
  if (room.players.size >= 6) return { error: 'Room is full (max 6)' };
  if ([...room.players.values()].some((pl) => pl.name.toLowerCase() === p.name.toLowerCase())) {
    return { error: 'That name is taken' };
  }
  const player = addPlayer(room, p);
  return { room, player, rejoined: false };
}

// ---- test bots ----

const BOT_NAMES = ['Botley', 'Pixel', 'Nacho', 'Biscuit', 'Waffles', 'Gizmo'];

/** Add a server-driven bot to the lobby (host-only, lobby-only). Max 6 total players. */
export function addBot(room: Room, byPlayerId: string): { error?: string } {
  if (byPlayerId !== room.hostId) return { error: 'Only the host can add bots' };
  if (room.phase !== 'lobby') return { error: 'Can only add bots in the lobby' };
  if (room.players.size >= 6) return { error: 'Room is full (max 6)' };
  const used = new Set([...room.players.values()].map((p) => p.name));
  const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${room.players.size}`;
  addPlayer(room, { id: `bot_${name}_${room.code}`, name, socketId: null, isBot: true });
  return {};
}

/** Remove the most-recently-added bot. */
export function removeBot(room: Room, byPlayerId: string): { error?: string } {
  if (byPlayerId !== room.hostId) return { error: 'Only the host can remove bots' };
  if (room.phase !== 'lobby') return { error: 'Can only remove bots in the lobby' };
  const botId = [...room.order].reverse().find((id) => room.players.get(id)?.isBot);
  if (!botId) return { error: 'No bots to remove' };
  room.players.delete(botId);
  room.order = room.order.filter((id) => id !== botId);
  return {};
}

export function markDisconnected(socketId: string): Room | undefined {
  for (const room of rooms.values()) {
    for (const pl of room.players.values()) {
      if (pl.socketId === socketId) {
        pl.connected = false;
        pl.socketId = null;
        // If host dropped, hand host to the next connected human (never a bot).
        if (pl.id === room.hostId) {
          const next = room.order
            .map((id) => room.players.get(id)!)
            .find((x) => x.connected && !x.isBot && x.id !== pl.id);
          if (next) {
            room.hostId = next.id;
            next.isHost = true;
            pl.isHost = false;
          }
        }
        return room;
      }
    }
  }
  return undefined;
}

// ---- phase transitions ----

export function startGame(room: Room, byPlayerId: string): { error?: string } {
  if (byPlayerId !== room.hostId) return { error: 'Only the host can start' };
  if (room.phase !== 'lobby') return { error: 'Already started' };
  const connected = [...room.players.values()].filter((p) => p.connected);
  if (connected.length < 2) return { error: 'Need at least 2 players' };
  room.phase = 'selecting';
  void ensureRoomPrompts(room); // pre-generate prompts now, hidden behind the selecting phase (4b)
  return {};
}

export function lockRestaurant(room: Room, playerId: string, restaurant: Restaurant): { error?: string } {
  const p = room.players.get(playerId);
  if (!p) return { error: 'Player not found' };
  if (room.phase !== 'selecting') return { error: 'Not in selection phase' };
  p.restaurant = restaurant;
  return {};
}

/**
 * Generate the room's 3 shared round prompts once, cached on the room (idempotent). Kicked
 * off at game start so the answering phase begins instantly. generateRoundPrompts already
 * falls back to a mock on any LLM failure, so this never rejects in practice.
 */
export function ensureRoomPrompts(room: Room): Promise<void> {
  if (room.prompts && room.prompts.length >= 3) return Promise.resolve();
  if (room.promptsPromise) return room.promptsPromise;
  const promise = generateRoundPrompts(room.outingType)
    .then((p) => {
      room.prompts = p;
    })
    .catch((err) => {
      console.warn('[rooms] ensureRoomPrompts failed:', (err as Error).message);
      room.promptsPromise = undefined; // let beginAnswering retry
    });
  room.promptsPromise = promise;
  return promise;
}

/** True if another player has already locked a restaurant with this name (case-insensitive). */
export function destinationTaken(room: Room, playerId: string, name: string): boolean {
  const target = name.trim().toLowerCase();
  if (!target) return false;
  for (const p of room.players.values()) {
    if (p.id === playerId) continue;
    if (p.restaurant && p.restaurant.name.trim().toLowerCase() === target) return true;
  }
  return false;
}

/** True when every connected player has locked a restaurant. */
export function allRestaurantsLocked(room: Room): boolean {
  const players = [...room.players.values()].filter((p) => p.connected);
  return players.length >= 2 && players.every((p) => !!p.restaurant);
}

/** Ensure the room's shared prompts are ready (pre-generated at start), copy them to each
 *  player as their per-round questions, then advance. */
export async function beginAnswering(room: Room): Promise<void> {
  if (room.phase !== 'selecting') return;
  await ensureRoomPrompts(room);
  const prompts = room.prompts ?? [];
  const questions: Question[] = prompts.map((p, round) => ({ id: `q${round}`, round, text: p.text }));
  for (const p of room.players.values()) {
    if (p.restaurant) p.questions = questions;
  }
  room.phase = 'answering';
}

export function submitAnswers(room: Room, playerId: string, answers: Record<string, string>): { error?: string } {
  const p = room.players.get(playerId);
  if (!p) return { error: 'Player not found' };
  if (room.phase !== 'answering') return { error: 'Not answering phase' };
  // Only keep answers for this player's own questions.
  for (const q of p.questions) {
    if (typeof answers[q.id] === 'string' && answers[q.id].trim()) {
      p.answers[q.id] = answers[q.id].trim().slice(0, 280);
    }
  }
  return {};
}

export function hasAnsweredAll(p: Player): boolean {
  return p.questions.length > 0 && p.questions.every((q) => !!p.answers[q.id]);
}

export function allAnswered(room: Room): boolean {
  const players = [...room.players.values()].filter((p) => p.connected && p.restaurant);
  return players.length >= 2 && players.every((p) => hasAnsweredAll(p));
}

export function beginVoting(room: Room): void {
  if (room.phase !== 'answering') return;
  room.phase = 'voting';
  room.round = 0;
}

/** The answer cards for the current voting round (one per player who answered it). */
export function voteCardsForRound(room: Room, round: number): VoteCard[] {
  const cards: VoteCard[] = [];
  for (const id of room.order) {
    const p = room.players.get(id)!;
    const q = p.questions.find((q) => q.round === round);
    if (q && p.answers[q.id]) {
      cards.push({ id: p.id, authorId: p.id, authorName: p.name, text: p.answers[q.id] });
    }
  }
  return cards;
}

/** How many answers this voter must rank this round (their own card excluded). */
export function requiredPicks(room: Room, round: number, voterId: string): number {
  const available = voteCardsForRound(room, round).filter((c) => c.authorId !== voterId).length;
  return maxPicks(available);
}

export function submitVote(room: Room, playerId: string, rankedAuthorIds: string[]): { error?: string } {
  const p = room.players.get(playerId);
  if (!p) return { error: 'Player not found' };
  if (room.phase !== 'voting') return { error: 'Not voting phase' };

  const picks = Array.isArray(rankedAuthorIds) ? rankedAuthorIds : [];
  const need = requiredPicks(room, room.round, playerId);
  const validIds = new Set(
    voteCardsForRound(room, room.round)
      .map((c) => c.authorId)
      .filter((id) => id !== playerId),
  );

  // Strict, server-authoritative validation — never trust the client (2b).
  if (picks.length !== need) return { error: `Pick exactly ${need}` };
  if (new Set(picks).size !== picks.length) return { error: 'No duplicate picks' };
  if (picks.includes(playerId)) return { error: "Can't vote for yourself" };
  if (picks.some((id) => !validIds.has(id))) return { error: 'Invalid pick' };

  p.votes[room.round] = picks; // keyed by round → re-submits overwrite, never double-count (2c)
  return {};
}

export function hasVoted(room: Room, p: Player): boolean {
  return Array.isArray(p.votes[room.round]);
}

export function allVoted(room: Room): boolean {
  const players = [...room.players.values()].filter((p) => p.connected && p.restaurant);
  return players.length >= 2 && players.every((p) => hasVoted(room, p));
}

/** Tally the current round (3/2/1 by rank) into player scores, then show leaderboard. */
export function tallyRoundAndAdvance(room: Room): void {
  if (room.phase !== 'voting') return;
  const weights = [3, 2, 1];
  for (const voter of room.players.values()) {
    const ranked = voter.votes[room.round] ?? [];
    ranked.forEach((authorId, i) => {
      const author = room.players.get(authorId);
      if (author) author.score += weights[i] ?? 0;
    });
  }
  room.phase = 'leaderboard';
}

/** Host advances from a leaderboard to the next round, or to the final result. */
export function nextRound(room: Room, byPlayerId: string): { error?: string } {
  if (byPlayerId !== room.hostId) return { error: 'Only the host can advance' };
  if (room.phase !== 'leaderboard') return { error: 'Not at a leaderboard' };
  if (room.round + 1 < TOTAL_ROUNDS) {
    room.round += 1;
    room.phase = 'voting';
  } else {
    finalize(room);
  }
  return {};
}

function finalize(room: Room): void {
  room.phase = 'final';
  const players = [...room.players.values()].filter((p) => p.restaurant);
  players.sort((a, b) => b.score - a.score);
  const champ = players[0];
  if (champ?.restaurant) {
    room.winner = { playerName: champ.name, restaurant: champ.restaurant };
  }
}

export function resetToLobby(room: Room, byPlayerId: string): { error?: string } {
  if (byPlayerId !== room.hostId) return { error: 'Only the host can restart' };
  room.phase = 'lobby';
  room.round = 0;
  room.winner = undefined;
  room.prompts = undefined;
  room.promptsPromise = undefined;
  room.deadlineTs = null;
  for (const p of room.players.values()) {
    p.restaurant = undefined;
    p.questions = [];
    p.answers = {};
    p.votes = {};
    p.score = 0;
  }
  return {};
}

/** Host sets or clears the group's decision topic while in lobby. */
export function setDecisionTopic(room: Room, byPlayerId: string, topic: string): { error?: string } {
  if (byPlayerId !== room.hostId) return { error: 'Only the host can set the topic' };
  if (room.phase !== 'lobby') return { error: 'Topic can only be changed in the lobby' };
  const trimmed = topic.trim();
  room.decisionTopic = trimmed || undefined;
  return {};
}

// ---- serialization ----

export function serializeRoom(room: Room): RoomView {
  const players: PlayerView[] = room.order
    .map((id) => room.players.get(id)!)
    .filter(Boolean)
    .map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      isHost: p.id === room.hostId,
      isBot: p.isBot,
      score: p.score,
      hasRestaurant: !!p.restaurant,
      restaurantName: p.restaurant?.name,
      hasAnswered: hasAnsweredAll(p),
      hasVoted: room.phase === 'voting' ? hasVoted(room, p) : false,
    }));

  const view: RoomView = {
    code: room.code,
    outingType: room.outingType,
    phase: room.phase,
    hostId: room.hostId,
    players,
    round: room.round,
    totalRounds: TOTAL_ROUNDS,
    deadlineTs: room.deadlineTs,
  };

  if (room.winner) view.winner = room.winner;
  if (room.decisionTopic) view.decisionTopic = room.decisionTopic;

  if (room.phase === 'voting') {
    const prompt = room.prompts?.[room.round];
    view.roundPrompt = prompt?.text;
    view.roundSnark = prompt?.snark;
    view.voteCards = voteCardsForRound(room, room.round);
  }
  return view;
}

/** Per-player private state (their questions + locked restaurant). */
export function privateStateFor(room: Room, playerId: string): PrivateState {
  const p = room.players.get(playerId);
  return {
    playerId,
    questions: p?.questions,
    restaurant: p?.restaurant,
  };
}

// ---- housekeeping: reap stale empty rooms ----

export function reapRooms(maxAgeMs = 1000 * 60 * 60 * 6): void {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyConnected = [...room.players.values()].some((p) => p.connected);
    if (!anyConnected && now - room.createdAt > maxAgeMs) rooms.delete(code);
  }
}

export type { Room, Player };
