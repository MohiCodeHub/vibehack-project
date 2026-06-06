// aiService — all LLM calls go through here.
// Set USE_MOCKS=true (default when no LLM_API_KEY) to run fully offline.

import type { Restaurant, SwipeCard, Question } from '../../../shared/types.ts';

const USE_MOCKS = process.env.USE_MOCKS === 'true' || !process.env.LLM_API_KEY;
const LLM_MODEL = process.env.LLM_MODEL || 'claude-haiku-4-5-20251001';

// ---- Swipe cards ----

const MOCK_SWIPE_CARDS: SwipeCard[] = [
  { id: 'vibe', axis: 'Vibe', left: 'Casual & comfy', right: 'Fancy & dressed up' },
  { id: 'adventure', axis: 'Menu', left: 'Familiar favorites', right: 'Bold & adventurous' },
  { id: 'pace', axis: 'Pace', left: 'Quick bite', right: 'Long & lingering' },
  { id: 'budget', axis: 'Budget', left: 'Keep it cheap', right: 'Splurge a little' },
  { id: 'volume', axis: 'Energy', left: 'Quiet & chill', right: 'Loud & lively' },
];

/** Generate the binary trade-off swipe cards for an outing type. */
export async function generateSwipeCards(outingType: string): Promise<SwipeCard[]> {
  if (USE_MOCKS) return MOCK_SWIPE_CARDS;
  try {
    const prompt = `Generate exactly 5 binary "this or that" trade-off cards to help someone pick a ${outingType} restaurant.
Return ONLY a JSON array of objects with keys: id (short slug), axis (1-2 word label), left (short option), right (short option).
Use these axis ids in this order: vibe, adventure, pace, budget, volume.`;
    const json = await llmJson(prompt);
    if (Array.isArray(json) && json.length) return json as SwipeCard[];
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
  let texts: string[];
  if (USE_MOCKS) {
    texts = mockQuestionTemplates(player.restaurant);
  } else {
    try {
      const prompt = `Write exactly 3 short, comedic party-game questions for a player named "${player.name}" who is championing the restaurant "${player.restaurant.name}"${
        player.restaurant.category ? ` (${player.restaurant.category})` : ''
      }.
Each question should be punchy (under 200 chars), funny, and reference the restaurant where natural.
Return ONLY a JSON array of 3 strings.`;
      const json = await llmJson(prompt);
      texts = Array.isArray(json) && json.length === 3 ? (json as string[]) : mockQuestionTemplates(player.restaurant);
    } catch (err) {
      console.warn('[aiService] generateQuestions fell back to mock:', (err as Error).message);
      texts = mockQuestionTemplates(player.restaurant);
    }
  }
  return texts.map((text, round) => ({ id: `q${round}`, round, text }));
}

/** The shared prompt template shown above the answer cards for a given round. */
export const ROUND_PROMPTS = [
  'The most unhinged reason to pick this place:',
  'The dangerous secret menu item:',
  'The drunk one-sentence review:',
];

// ---- LLM plumbing ----

async function llmJson(prompt: string): Promise<unknown> {
  const key = process.env.LLM_API_KEY!;
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
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const json = (await res.json()) as any;
  const text: string = json.content?.[0]?.text ?? '';
  // Extract the first JSON array/object from the response.
  const match = text.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in LLM response');
  return JSON.parse(match[0]);
}

export const aiConfig = { USE_MOCKS, LLM_MODEL };
