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
  type Room,
  type Player,
} from './rooms.ts';
import { randomSampleRestaurant } from './services/placesService.ts';

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
function driveBots(room: Room): boolean {
  let changed = false;
  for (const p of room.players.values()) {
    if (!p.isBot) continue;
    if (room.phase === 'selecting' && !p.restaurant) {
      lockRestaurant(room, p.id, randomSampleRestaurant());
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
}
