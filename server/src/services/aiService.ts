// aiService — all LLM calls go through here.
// Set USE_MOCKS=true (default when no LLM_API_KEY) to run fully offline.
//
// Supports two providers via LLM_PROVIDER (openai | anthropic). Either way the mock is
// the runtime fallback: every live path is wrapped with a timeout + try/catch so a hanging
// or malformed LLM response can NEVER wedge the game (Section 4). On any failure we log
// and return the mock.

import type { SwipeCard } from '../../../shared/types.ts';

const USE_MOCKS = process.env.USE_MOCKS === 'true' || !process.env.LLM_API_KEY;
const LLM_PROVIDER = (process.env.LLM_PROVIDER || 'openai').toLowerCase(); // 'openai' | 'anthropic'
const DEFAULT_MODEL = LLM_PROVIDER === 'anthropic' ? 'claude-haiku-4-5-20251001' : 'gpt-4o';
const LLM_MODEL = process.env.LLM_MODEL || DEFAULT_MODEL;
const LLM_TIMEOUT_MS = 12000;

// ---- Swipe cards ----

// Generic, distinct trade-offs that fit any outing type (used offline / on fallback).
const MOCK_SWIPE_CARDS: SwipeCard[] = [
  { id: 'budget', axis: 'Budget', left: 'Keep it cheap', right: 'Treat ourselves' },
  { id: 'energy', axis: 'Energy', left: 'Chill & low-key', right: 'Big & lively' },
  { id: 'setting', axis: 'Setting', left: 'Cozy indoors', right: 'Out & about' },
  { id: 'novelty', axis: 'Vibe', left: 'Familiar favourite', right: 'Something new' },
  { id: 'time', axis: 'Time', left: 'Quick & easy', right: 'Make a day of it' },
];

/** True if x looks like a usable SwipeCard. */
function isSwipeCard(x: unknown): x is SwipeCard {
  const c = x as Record<string, unknown>;
  return (
    !!c &&
    typeof c.id === 'string' &&
    typeof c.left === 'string' &&
    typeof c.right === 'string' &&
    typeof c.axis === 'string'
  );
}

/** Generate the binary trade-off swipe cards for an outing type. */
export async function generateSwipeCards(outingType: string): Promise<SwipeCard[]> {
  if (USE_MOCKS) return MOCK_SWIPE_CARDS;
  try {
    const prompt = `The group is deciding on: "${outingType}". Generate exactly 5 binary "this or that" trade-off cards that help them narrow down what to pick.
Rules: each card must be a DISTINCT dimension — no two cards should overlap or ask the same thing — and every card must make sense for "${outingType}". Choose whichever dimensions fit best (e.g. budget, energy level, indoor vs outdoor, familiar vs adventurous, quick vs all-day, small vs big group, chill vs wild).
Return ONLY JSON of the form {"cards": [{"id": "short-slug", "axis": "1-2 word label", "left": "short option", "right": "short option"}]} with exactly 5 distinct cards.`;
    const arr = firstArray(await llmJson(prompt));
    if (arr) {
      const cards = arr.filter(isSwipeCard);
      if (cards.length >= 3) return cards.slice(0, 5);
    }
    throw new Error('bad swipe-card shape');
  } catch (err) {
    console.warn('[aiService] generateSwipeCards fell back to mock:', (err as Error).message);
  }
  return MOCK_SWIPE_CARDS;
}

// ---- Candidates (LLM-suggested options for the swipe flow) ----
//
// Options are keyed on the DECISION TOPIC, not hardcoded to restaurants: for "Dinner" you get
// specific restaurants; for "Weekend activity" you get a mix of activities ("Go to the cinema")
// and specific venues ("Alton Towers"). `specific` flags whether it's a named place.

export interface Candidate {
  name: string;
  category?: string;
  /** True for a specific named place (gets an address); false for a general activity. */
  specific?: boolean;
  area?: string; // neighbourhood/area within the city (specific places only)
  priceLevel?: number; // 1-4
  rating?: number; // 0-5
}

function toCandidate(x: unknown): Candidate | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  if (!name) return null;
  const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : undefined);
  return {
    name: name.slice(0, 60),
    category: typeof o.category === 'string' ? o.category.slice(0, 40) : undefined,
    specific: o.specific === true,
    area: typeof o.area === 'string' ? o.area.slice(0, 60) : undefined,
    priceLevel: num(o.priceLevel),
    rating: num(o.rating),
  };
}

/**
 * Suggest varied options for a decision topic, matching a free-text preference string.
 * Options may be specific named places OR general activities — whatever fits the topic.
 * Returns null when AI is mocked or on failure, so the caller can fall back.
 */
export async function generateCandidates(topic: string, city: string, prefs: string, count = 4): Promise<Candidate[] | null> {
  if (USE_MOCKS) return null;
  try {
    const prompt = `The group is deciding on: "${topic}". Suggest exactly ${count} specific, varied options they could actually do${city ? `, in or around ${city}` : ''}, matching these preferences: ${prefs}.
Options can be a specific named place (e.g. a particular restaurant, cinema, or venue) OR a general activity (e.g. "Go to the cinema", "Visit a theme park", "Mini golf") — whatever genuinely fits "${topic}". Mix them where sensible and vary the options.
For a specific named place, set "specific": true and include an "area" (neighbourhood). For a general activity, set "specific": false and omit area.
Return ONLY JSON of the form {"options": [{"name": "...", "category": "short label", "specific": true, "area": "neighbourhood", "priceLevel": 1, "rating": 4.5}]} where priceLevel is 1-4 and rating 0-5 (omit price/rating for general activities).`;
    const arr = firstArray(await llmJson(prompt, { attempts: 2, timeoutMs: LLM_TIMEOUT_MS }));
    if (arr) {
      const options = arr.map(toCandidate).filter((c): c is Candidate => c !== null);
      if (options.length >= 1) return options.slice(0, count);
    }
    return null;
  } catch (err) {
    console.warn('[aiService] generateCandidates failed:', (err as Error).message);
    return null;
  }
}

// ---- Round prompts (chaotic, category-aware game-show prompts) ----
//
// Three prompts are generated PER ROOM from the outing category (not per player), so
// everyone answers the same prompts and the voting header matches the question. Each
// carries a short host "snark" line for flavor.

export interface RoundPrompt {
  /** The prompt shown to every player (and as the voting-round header). */
  text: string;
  /** A 1-sentence snarky host quip read out after the prompt. */
  snark: string;
}

/** Defense-style fallback prompts about each player's own pick (offline or on any LLM failure). */
const MOCK_ROUND_PROMPTS: RoundPrompt[] = [
  {
    text: "Make the case: what's the ONE detail about your pick that ends the debate instantly?",
    snark: 'Bold opening argument. The committee is pretending to be impressed.',
  },
  {
    text: 'Your pick has one deeply embarrassing flaw. Confess it — then defend it anyway.',
    snark: 'Ah, the ol’ admit-and-deflect. Legally distinct from an actual defense.',
  },
  {
    text: 'Hype your pick like your reputation depends on it. One unhinged sentence.',
    snark: 'Ten out of ten for enthusiasm, zero for restraint. I love it.',
  },
];

/** True if x looks like a usable round prompt from the LLM. */
function toRoundPrompt(x: unknown): RoundPrompt | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const text = typeof o.prompt === 'string' ? o.prompt.trim() : '';
  if (!text) return null;
  const snark = typeof o.host_snark === 'string' ? o.host_snark.trim() : '';
  return { text: text.slice(0, 150), snark: snark.slice(0, 200) };
}

/** The chaotic game-show-host system prompt, parameterized by the decision category. */
function roundPromptInstruction(category: string): string {
  return `# ROLE AND CONTEXT
You are the chaotic, high-energy, and slightly passive-aggressive game show host of "Where To?", a Jackbox-style party game.
The goal of this game is to cure "Group Indecision Syndrome" by forcing friends into hilarious, high-stakes debates over everyday choices.
The group is deciding on: "${category}". Each player has ALREADY chosen a specific option (a Place, Thing, or Activity) that they are championing for the group.

# YOUR TASK
Generate exactly 3 quirky, hyper-specific game prompts. Every player answers the SAME 3 prompts, but about THEIR OWN pick. Their answers then battle head-to-head in voting until one winner is chosen for the group to actually do.

# RULES FOR GENERATING PROMPTS:
1. ABOUT THEIR OWN PICK: Each prompt must make the player defend, hype, roast, or confess something about the specific option THEY are championing. Refer to it generically as "your pick" — NEVER name a specific option yourself (every player picked something different).
2. SELF-CONTAINED (CRITICAL): The player knows ONLY their own pick — they have NO idea what anyone else chose. NEVER reference "the other options", "the other picks", "everyone else", "the competition", or ask them to compare, rank, fight, or react to other players' choices. Every prompt must be fully answerable knowing only their own pick.
3. BAN INDECISION: No boring, open-ended questions. Corner them with hypotheticals, superlatives, confessions, or weird scenarios.
4. PROVOKE A DEFENSE: The prompt should make the player want to aggressively defend their pick to their friends.
5. KEEP IT SNAPPY: Under 150 characters. Punchy, sassy, readable on a TV screen.

# EXAMPLES (note how they reference "your pick" generically so they work for everyone):
- "Make the case: what's the ONE detail about your pick that ends the debate instantly?"
- "Your pick has one deeply embarrassing flaw. Confess it — then defend it anyway."
- "Hype your pick like your reputation depends on it. One unhinged sentence. Go."
- "Sell your pick to someone who hates fun. What's your opening line?"

# OUTPUT FORMAT
Return ONLY JSON of the form {"prompts": [{"prompt": "...", "host_snark": "..."}]} with exactly 3 objects.
Each object has "prompt" (shown to every player) and "host_snark" (a brief, 1-sentence snarky comment the host says after the prompt is read).

THE GROUP IS DECIDING ON: ${category}`;
}

/**
 * Generate the 3 shared round prompts for a decision category.
 * Retries hard (so a real failure is logically negligible), then falls back to the GENERIC
 * mock prompts — which are written about "your pick" so they fit any place or outing type,
 * never hang the game, and never look dinner-specific.
 */
export async function generateRoundPrompts(outingType: string): Promise<RoundPrompt[]> {
  if (USE_MOCKS) return MOCK_ROUND_PROMPTS;
  try {
    const arr = firstArray(await llmJson(roundPromptInstruction(outingType), { attempts: 3, timeoutMs: LLM_TIMEOUT_MS }));
    if (arr) {
      const prompts = arr.map(toRoundPrompt).filter((p): p is RoundPrompt => p !== null);
      if (prompts.length >= 3) return prompts.slice(0, 3);
    }
    throw new Error('LLM returned no usable round prompts');
  } catch (err) {
    console.warn('[aiService] generateRoundPrompts fell back to generic mock:', (err as Error).message);
    return MOCK_ROUND_PROMPTS;
  }
}

// ---- LLM plumbing ----

/** Strip ```json fences an LLM sometimes wraps JSON in. */
function stripFences(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Get the array out of either a bare array or a {key: [...]} wrapper object. */
function firstArray(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    for (const v of Object.values(parsed as Record<string, unknown>)) {
      if (Array.isArray(v)) return v;
    }
  }
  return null;
}

/** Parse JSON from a possibly-prose-wrapped LLM response. Returns null if nothing parses. */
function parseJsonLoose(text: string): unknown {
  const stripped = stripFences(text);
  const whole = safeJson(stripped);
  if (whole !== null) return whole;
  // Fall back to the first array/object substring.
  const match = stripped.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  if (match) {
    const extracted = safeJson(match[0]);
    if (extracted !== null) return extracted;
  }
  return null;
}

/**
 * Prompt the configured LLM and return parsed JSON, retrying a few times before giving up.
 * Throws if every attempt fails — callers decide whether to fall back (swipe cards) or
 * surface an error (round prompts). Retries make a live failure logically negligible.
 */
async function llmJson(prompt: string, opts: { attempts?: number; timeoutMs?: number } = {}): Promise<unknown> {
  const attempts = opts.attempts ?? 3;
  const timeoutMs = opts.timeoutMs ?? LLM_TIMEOUT_MS;
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await llmJsonOnce(prompt, timeoutMs);
    } catch (err) {
      lastErr = err;
      console.warn(`[aiService] LLM attempt ${i}/${attempts} failed: ${(err as Error).message}`);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('LLM failed');
}

/** One LLM call with a hard timeout. Throws on any failure. */
async function llmJsonOnce(prompt: string, timeoutMs: number): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const text = await llmRaw(prompt, ctrl.signal);
    const parsed = parseJsonLoose(text);
    if (parsed === null) throw new Error('no JSON in LLM response');
    return parsed;
  } catch (err) {
    // Normalize the abort into a clearer message for logs.
    if ((err as Error).name === 'AbortError') throw new Error(`LLM timed out after ${timeoutMs}ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Raw completion text from the configured provider. Throws on non-2xx. */
async function llmRaw(prompt: string, signal: AbortSignal): Promise<string> {
  const key = process.env.LLM_API_KEY!;

  if (LLM_PROVIDER === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal,
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const json = (await res.json()) as any;
    return json.content?.[0]?.text ?? '';
  }

  // OpenAI (default) — Chat Completions.
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1024,
      temperature: 0.9,
      // Force syntactically valid JSON (prompt asks for a {key: [...]} object).
      response_format: { type: 'json_object' },
    }),
    signal,
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const json = (await res.json()) as any;
  return json.choices?.[0]?.message?.content ?? '';
}

export const aiConfig = { USE_MOCKS, LLM_PROVIDER, LLM_MODEL };
