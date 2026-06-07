// Central game-flow orchestration: auto-advances phases when everyone (humans
// AND test bots) has acted, and drives bots to lock / answer / vote.

import {
  allRestaurantsLocked,
  allAnswered,
  allVoted,
  beginAnswering,
  beginVoting,
  tallyRoundAndAdvance,
  lockRestaurant,
  submitAnswers,
  submitVote,
  hasAnsweredAll,
  hasVoted,
  voteCardsForRound,
  destinationTaken,
  getRoom,
  type Room,
  type Player,
} from './rooms.ts';
import { randomSampleRestaurant } from './services/placesService.ts';
import type { Restaurant } from '../../shared/types.ts';
import type { Phase } from '../../shared/types.ts';

// Canned, mildly-unhinged bot answers per round (kept funny + on-theme).
const BOT_ANSWERS: string[][] = [
  [
    'It has a parking lot the size of a small nation.',
    'My horoscope literally demanded it.',
    'They know me by name and that is both a blessing and a threat.',
    'Free bread. That is the entire reason. Free bread.',
  ],
  [
    'The “Inadvisable Nachos” — served on a hubcap, no refunds.',
    'A 14-egg omelette named after my last breakup.',
    'The “Silent Treatment”: a plate that just stares back at you.',
    'Spaghetti, but it’s one single noodle the length of a canoe.',
  ],
  [
    '“I came, I saw, I forgot where I parked.”',
    '“Five stars. The chairs exist. Incredible.”',
    '“The soup whispered my name and I have not slept since.”',
    '“Bold flavors, questionable life choices, would weep here again.”',
  ],
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function botAnswer(p: Player, round: number): string {
  const pool = BOT_ANSWERS[round] ?? BOT_ANSWERS[0];
  // Vary by bot name so bots don't all say the same thing.
  const seed = (p.name.charCodeAt(0) + round) % pool.length;
  return pool[seed];
}

/** Make every bot take its action for the current phase. Returns true if anything changed. */
/** A sample restaurant not already championed by someone else (best-effort, bounded). */
function uniqueSampleFor(room: Room, playerId: string): Restaurant {
  let pick = randomSampleRestaurant();
  for (let i = 0; i < 8 && destinationTaken(room, playerId, pick.name); i++) {
    pick = randomSampleRestaurant();
  }
  return pick;
}

function driveBots(room: Room): boolean {
  let changed = false;
  for (const p of room.players.values()) {
    if (!p.isBot) continue;
    if (room.phase === 'selecting' && !p.restaurant) {
      lockRestaurant(room, p.id, uniqueSampleFor(room, p.id));
      changed = true;
    } else if (room.phase === 'answering' && p.questions.length > 0 && !hasAnsweredAll(p)) {
      const answers: Record<string, string> = {};
      for (const q of p.questions) answers[q.id] = botAnswer(p, q.round);
      submitAnswers(room, p.id, answers);
      changed = true;
    } else if (room.phase === 'voting' && !hasVoted(room, p)) {
      const cards = voteCardsForRound(room, room.round).filter((c) => c.authorId !== p.id);
      const ranked = shuffle(cards).slice(0, 3).map((c) => c.authorId);
      submitVote(room, p.id, ranked);
      changed = true;
    }
  }
  return changed;
}

/**
 * Advance the room as far as it can go: drive bots, and auto-advance phases once
 * everyone has acted. Idempotent — safe to call after any human action.
 */
export async function tick(room: Room): Promise<void> {
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 25) {
    changed = false;
    if (room.phase === 'selecting' && allRestaurantsLocked(room)) {
      await beginAnswering(room);
      changed = true;
    } else if (room.phase === 'answering' && allAnswered(room)) {
      beginVoting(room);
      changed = true;
    } else if (room.phase === 'voting' && allVoted(room)) {
      tallyRoundAndAdvance(room);
      changed = true;
    }
    if (driveBots(room)) changed = true;
  }
  armTimer(room);
}

// ---- Server-authoritative phase timers (Section 1c) ----
//
// Each timed phase gets a deadline. When it expires we force-advance using the same
// path the submit gate uses, so a missing/slow/disconnected player can never wedge a
// room. The client renders a countdown from room.deadlineTs — it's never trusted for logic.

/** How long each timed phase lasts, in ms. Untimed phases (lobby/leaderboard/final) are absent. */
const PHASE_MS: Partial<Record<Phase, number>> = {
  selecting: 90_000,
  answering: 75_000,
  voting: 45_000,
};

interface PhaseTimer {
  handle: ReturnType<typeof setTimeout>;
  deadlineTs: number;
  /** The exact phase + round this timer was armed for, to detect a new phase instance. */
  phase: Phase;
  round: number;
}
const timers = new Map<string, PhaseTimer>();

/** Broadcast hook, injected once at startup so timer expiry can push state to clients. */
let broadcaster: (room: Room) => void = () => {};
export function setBroadcaster(fn: (room: Room) => void): void {
  broadcaster = fn;
}

/** Clear and forget a room's phase timer. Safe to call when none is set. */
export function clearPhaseTimer(code: string): void {
  const t = timers.get(code);
  if (t) {
    clearTimeout(t.handle);
    timers.delete(code);
  }
}

/**
 * Ensure the room's timer matches its current phase/round. Starts a fresh timer when
 * entering a timed phase (or a new voting round), and clears it on untimed phases.
 */
function armTimer(room: Room): void {
  const ms = PHASE_MS[room.phase];
  if (ms == null) {
    clearPhaseTimer(room.code);
    room.deadlineTs = null;
    return;
  }
  const existing = timers.get(room.code);
  if (existing && existing.phase === room.phase && existing.round === room.round) {
    return; // already counting down for this exact phase instance
  }
  clearPhaseTimer(room.code);
  const deadlineTs = Date.now() + ms;
  const handle = setTimeout(() => onExpire(room.code), ms);
  timers.set(room.code, { handle, deadlineTs, phase: room.phase, round: room.round });
  room.deadlineTs = deadlineTs;
}

/** Timer fired: force the current phase to advance, then re-tick + re-arm + broadcast. */
async function onExpire(code: string): Promise<void> {
  timers.delete(code);
  const room = getRoom(code);
  if (!room) return;
  forceAdvance(room);
  await tick(room); // drive bots in the new phase + arm its timer
  broadcaster(room);
}

/**
 * Move the current timed phase forward even though not everyone has acted. Players who
 * didn't lock get a random pick (so they still get questions); missing answers/votes
 * simply don't count. Called when a phase timer expires.
 */
function forceAdvance(room: Room): void {
  if (room.phase === 'selecting') {
    // Give any holdout a pick so they still get questions; the caller's tick() then
    // sees everyone locked and runs the (single, async) transition to answering.
    for (const p of room.players.values()) {
      if ((p.connected || p.isBot) && !p.restaurant) {
        lockRestaurant(room, p.id, uniqueSampleFor(room, p.id));
      }
    }
  } else if (room.phase === 'answering') {
    beginVoting(room);
  } else if (room.phase === 'voting') {
    tallyRoundAndAdvance(room);
  }
}
