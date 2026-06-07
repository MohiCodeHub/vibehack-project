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
    const prompt = `Generate exactly 5 binary "this or that" trade-off cards to help a group decide on their ${outingType} outing.
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
2. BAN INDECISION: No boring, open-ended questions. Corner them with hypotheticals, superlatives, confessions, or weird scenarios.
3. PROVOKE A DEFENSE: The prompt should make the player want to aggressively defend their pick to their friends.
4. KEEP IT SNAPPY: Under 150 characters. Punchy, sassy, readable on a TV screen.

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

/** Generate the 3 shared round prompts for an outing category. Falls back to the mock. */
export async function generateRoundPrompts(outingType: string): Promise<RoundPrompt[]> {
  if (USE_MOCKS) return MOCK_ROUND_PROMPTS;
  try {
    const arr = firstArray(await llmJson(roundPromptInstruction(outingType)));
    if (arr) {
      const prompts = arr.map(toRoundPrompt).filter((p): p is RoundPrompt => p !== null);
      if (prompts.length >= 3) return prompts.slice(0, 3);
    }
    throw new Error('bad round-prompts shape');
  } catch (err) {
    console.warn('[aiService] generateRoundPrompts fell back to mock:', (err as Error).message);
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
