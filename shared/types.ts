// Shared protocol + domain types used by both server and client.
// Types only — erased at compile time, so both sides can import freely.

export type Phase =
  | 'lobby'
  | 'selecting'
  | 'answering'
  | 'voting'
  | 'leaderboard'
  | 'final';

export interface Restaurant {
  id: string;
  name: string;
  /** Short cuisine / category label, e.g. "Italian", "Tacos". */
  category?: string;
  priceLevel?: number; // 1-4
  rating?: number; // 0-5
  address?: string;
  mapUrl?: string;
  /** Where this came from: a real place or free text the player typed. */
  source: 'places' | 'freetext';
}

/** A binary trade-off card shown in the "help me decide" swipe flow. */
export interface SwipeCard {
  id: string;
  /** Swipe LEFT chooses this. */
  left: string;
  /** Swipe RIGHT chooses this. */
  right: string;
  /** Axis label, e.g. "Vibe", "Budget". */
  axis: string;
}

export interface SwipeChoice {
  cardId: string;
  /** Which side the player picked. */
  pick: 'left' | 'right';
  /** The human-readable option the player chose — used for category-agnostic matching. */
  choice?: string;
  /** The trade-off axis label (e.g. "Energy"), for richer LLM context. */
  axis?: string;
  /** The option the player rejected (the other side). */
  rejected?: string;
}

/** One personalized comedic question for a player. */
export interface Question {
  id: string;
  /** Round index this question belongs to (0,1,2). */
  round: number;
  /** Fully personalized prompt shown to the player. */
  text: string;
}

/** Public-facing player view (safe to broadcast to everyone). */
export interface PlayerView {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
  /** True for server-driven test bots. */
  isBot: boolean;
  score: number;
  /** Has this player locked a restaurant? */
  hasRestaurant: boolean;
  /** Restaurant name is public once locked; full details revealed at the end. */
  restaurantName?: string;
  /** Has this player submitted all answers for the answering phase? */
  hasAnswered: boolean;
  /** Has this player submitted their vote for the current voting round? */
  hasVoted: boolean;
}

/** An answer card shown during a voting round. */
export interface VoteCard {
  /** Stable id = authorPlayerId for the round (one answer per player per round). */
  id: string;
  authorId: string;
  authorName: string;
  text: string;
}

/** Client-safe serialized room state, broadcast on every change. */
export interface RoomView {
  code: string;
  outingType: string;
  phase: Phase;
  hostId: string;
  players: PlayerView[];
  /** Current voting round index (0-based) when phase === 'voting' | 'leaderboard'. */
  round: number;
  totalRounds: number;
  /**
   * Server-authoritative deadline (epoch ms) for the current timed phase, or null
   * when the phase isn't timed. Clients render a countdown from this — never their own clock.
   */
  deadlineTs: number | null;
  /** The shared prompt template for the current voting round. */
  roundPrompt?: string;
  /** A snarky one-line host quip shown with the current round's prompt. */
  roundSnark?: string;
  /** Answer cards for the current voting round (own card not votable). */
  voteCards?: VoteCard[];
  /** The winning restaurant, present when phase === 'final'. */
  winner?: {
    playerName: string;
    restaurant: Restaurant;
  };
  /** What the group is deciding on — set by host in lobby. Omitted when unset. */
  decisionTopic?: string;
}

/** What a single client receives that is specific to *them*. */
export interface PrivateState {
  playerId: string;
  /** This player's personalized questions (during 'answering'). */
  questions?: Question[];
  /** This player's locked restaurant. */
  restaurant?: Restaurant;
}

// ---- Socket event payloads ----

export interface CreateRoomReq {
  outingType: string;
  playerName: string;
  playerId: string;
  /** Optional custom decision topic (host may also set/update in lobby). */
  decisionTopic?: string;
}
export interface SetDecisionTopicReq {
  topic: string;
}
export interface JoinRoomReq {
  code: string;
  playerName: string;
  playerId: string;
}
export interface Ack<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

export const OUTING_TYPES = ['Dinner'] as const;
export type OutingType = (typeof OUTING_TYPES)[number];

/**
 * How many answers a voter must rank in a round, given how many answers are
 * available to them (their own already excluded). Ranked top-3 normally, but with
 * a small group there may be fewer than 3 to pick: 1 candidate → 1, 2 → 2, 3+ → 3.
 * Single source of truth for server validation, the client UI, and bot voting.
 */
export function maxPicks(availableAnswers: number): number {
  return Math.min(3, Math.max(0, availableAnswers));
}
