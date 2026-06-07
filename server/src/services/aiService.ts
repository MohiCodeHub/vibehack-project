// aiService — all LLM calls go through here.
// Set USE_MOCKS=true (default when no LLM_API_KEY) to run fully offline.
//
// Supports two providers via LLM_PROVIDER (openai | anthropic). Either way the mock is
// the runtime fallback: every live path is wrapped with a timeout + try/catch so a hanging
// or malformed LLM response can NEVER wedge the game (Section 4). On any failure we log
// and return the mock.

import type { Restaurant, SwipeCard, Question } from '../../../shared/types.ts';

const USE_MOCKS = process.env.USE_MOCKS === 'true' || !process.env.LLM_API_KEY;
const LLM_PROVIDER = (process.env.LLM_PROVIDER || 'openai').toLowerCase(); // 'openai' | 'anthropic'
const DEFAULT_MODEL = LLM_PROVIDER === 'anthropic' ? 'claude-haiku-4-5-20251001' : 'gpt-4o-mini';
const LLM_MODEL = process.env.LLM_MODEL || DEFAULT_MODEL;
const LLM_TIMEOUT_MS = 8000;

// ---- Swipe cards ----

const MOCK_SWIPE_CARDS: SwipeCard[] = [
  { id: 'vibe', axis: 'Vibe', left: 'Casual & comfy', right: 'Fancy & dressed up' },
  { id: 'adventure', axis: 'Menu', left: 'Familiar favorites', right: 'Bold & adventurous' },
  { id: 'pace', axis: 'Pace', left: 'Quick bite', right: 'Long & lingering' },
  { id: 'budget', axis: 'Budget', left: 'Keep it cheap', right: 'Splurge a little' },
  { id: 'volume', axis: 'Energy', left: 'Quiet & chill', right: 'Loud & lively' },
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
    const prompt = `Generate exactly 5 binary "this or that" trade-off cards to help someone pick a ${outingType} restaurant.
Return ONLY JSON of the form {"cards": [{"id": "...", "axis": "...", "left": "...", "right": "..."}]} where
id is a short slug, axis is a 1-2 word label, and left/right are short options.
Use these axis ids in this order: vibe, adventure, pace, budget, volume.`;
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

// ---- Comedic, restaurant-aware questions ----

/** Templates produce 3 questions personalized to the player's restaurant. */
function mockQuestionTemplates(r: Restaurant): string[] {
  const name = r.name;
  return [
    `You're trying to convince the group to go to ${name}. What's the most unhinged reason you give?`,
    `${name} just added a secret menu item named after you. What is it and why is it dangerous?`,
    `A critic reviews ${name} in exactly one sentence. They were... not sober. What did they write?`,
  ];
}

export async function generateQuestions(player: { name: string; restaurant: Restaurant }): Promise<Question[]> {
  const texts = await generateQuestionTexts(player);
  return texts.map((text, round) => ({ id: `q${round}`, round, text }));
}

/** The raw 3 question strings — live with mock fallback, always exactly 3. */
async function generateQuestionTexts(player: { name: string; restaurant: Restaurant }): Promise<string[]> {
  if (USE_MOCKS) return mockQuestionTemplates(player.restaurant);
  try {
    const prompt = `Write exactly 3 short, comedic party-game questions for a player named "${player.name}" who is championing the restaurant "${player.restaurant.name}"${
      player.restaurant.category ? ` (${player.restaurant.category})` : ''
    }.
Each question should be punchy (under 200 chars), funny, and reference the restaurant where natural.
Return ONLY JSON of the form {"questions": ["...", "...", "..."]} with exactly 3 strings.`;
    const arr = firstArray(await llmJson(prompt));
    if (arr) {
      const strings = arr.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
      if (strings.length >= 3) return strings.slice(0, 3).map((s) => s.slice(0, 240));
    }
    throw new Error('bad questions shape');
  } catch (err) {
    console.warn('[aiService] generateQuestions fell back to mock:', (err as Error).message);
    return mockQuestionTemplates(player.restaurant);
  }
}

/** The shared prompt template shown above the answer cards for a given round. */
export const ROUND_PROMPTS = [
  'The most unhinged reason to pick this place:',
  'The dangerous secret menu item:',
  'The drunk one-sentence review:',
];

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

/** Prompt the configured LLM with a hard timeout and return parsed JSON. Throws on any failure. */
async function llmJson(prompt: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS);
  try {
    const text = await llmRaw(prompt, ctrl.signal);
    const parsed = parseJsonLoose(text);
    if (parsed === null) throw new Error('no JSON in LLM response');
    return parsed;
  } catch (err) {
    // Normalize the abort into a clearer message for logs.
    if ((err as Error).name === 'AbortError') throw new Error(`LLM timed out after ${LLM_TIMEOUT_MS}ms`);
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
