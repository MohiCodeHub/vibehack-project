// placesService — all restaurant lookups go through here.
// Set USE_MOCKS=true (default when no PLACES_API_KEY) to run fully offline.

import type { Restaurant, SwipeChoice } from '../../../shared/types.ts';
import { generateCandidates, type Candidate } from './aiService.ts';

const USE_MOCKS = process.env.USE_MOCKS === 'true' || !process.env.PLACES_API_KEY;
const DEFAULT_CITY = process.env.DEFAULT_CITY || 'San Francisco';
const PLACES_TIMEOUT_MS = Number(process.env.PLACES_TIMEOUT_MS ?? 5000);
const AUTOCOMPLETE_FIELD_MASK =
  'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text,suggestions.placePrediction.text.text';

export interface LatLng {
  lat: number;
  lng: number;
}

/** 12 sample restaurants so the whole game works with zero network calls. */
const SAMPLE_RESTAURANTS: Restaurant[] = [
  { id: 's1', name: 'Nonna’s Trattoria', category: 'Italian', priceLevel: 3, rating: 4.6, address: '12 Vine St', source: 'places' },
  { id: 's2', name: 'El Farolito', category: 'Tacos', priceLevel: 1, rating: 4.4, address: '24 Mission Ave', source: 'places' },
  { id: 's3', name: 'The Gilded Fork', category: 'Fine Dining', priceLevel: 4, rating: 4.8, address: '1 Grand Plaza', source: 'places' },
  { id: 's4', name: 'Ramen Riot', category: 'Japanese', priceLevel: 2, rating: 4.5, address: '88 Noodle Ln', source: 'places' },
  { id: 's5', name: 'Burger Authority', category: 'Burgers', priceLevel: 1, rating: 4.2, address: '500 Patty Rd', source: 'places' },
  { id: 's6', name: 'Saffron Sky', category: 'Indian', priceLevel: 2, rating: 4.7, address: '33 Curry Ct', source: 'places' },
  { id: 's7', name: 'Green Garden', category: 'Vegetarian', priceLevel: 2, rating: 4.3, address: '7 Leaf Way', source: 'places' },
  { id: 's8', name: 'Smoke & Barrel', category: 'BBQ', priceLevel: 3, rating: 4.6, address: '210 Ember St', source: 'places' },
  { id: 's9', name: 'La Sirena', category: 'Seafood', priceLevel: 3, rating: 4.5, address: '9 Harbor Walk', source: 'places' },
  { id: 's10', name: 'Pho Real', category: 'Vietnamese', priceLevel: 1, rating: 4.4, address: '141 Broth Blvd', source: 'places' },
  { id: 's11', name: 'Dragon Wok', category: 'Chinese', priceLevel: 2, rating: 4.3, address: '64 Lantern St', source: 'places' },
  { id: 's12', name: 'Sweet & Savory Bistro', category: 'French', priceLevel: 4, rating: 4.7, address: '3 Bonjour Ave', source: 'places' },
];

function withMapUrl(r: Restaurant): Restaurant {
  const q = encodeURIComponent(`${r.name} ${r.address ?? DEFAULT_CITY}`);
  return { ...r, mapUrl: r.mapUrl ?? `https://www.google.com/maps/search/?api=1&query=${q}` };
}

/** Resolve a free-text restaurant name to a real nearby place (or a free-text fallback). */
export async function resolveRestaurant(name: string, loc?: LatLng): Promise<Restaurant> {
  if (USE_MOCKS) {
    // Try to fuzzy-match the typed name against the sample set for a nicer demo.
    const hit = SAMPLE_RESTAURANTS.find((r) => r.name.toLowerCase().includes(name.trim().toLowerCase()));
    if (hit) return withMapUrl(hit);
    return withMapUrl(freeTextRestaurant(name));
  }
  return resolveRestaurantLive(name, loc);
}

/**
 * Given a player's swipe profile and the decision topic, return 3-4 candidate options.
 * Real Google Places when a key is set; otherwise LLM-suggested options for the topic in
 * DEFAULT_CITY (specific places or general activities); only if that's unavailable do we fall
 * back to the scored sample set.
 */
export async function candidatesForProfile(choices: SwipeChoice[], topic: string, loc?: LatLng): Promise<Restaurant[]> {
  if (!USE_MOCKS) return candidatesForProfileLive(choices, loc);

  // No Places key → ask the LLM for topic-appropriate options matching the swipe profile.
  const llm = await generateCandidates(topic, DEFAULT_CITY, describeProfile(choices), 4);
  if (llm && llm.length) return llm.map((c) => candidateToRestaurant(c));

  // Last resort (only if the LLM is down): the scored built-in samples.
  return mockCandidatesForProfile(choices);
}

/**
 * Turn a swipe profile into a preference string. When the axis + rejected side are present we
 * send the full trade-off context ("Energy → Relaxing (over Active)"); otherwise just the choice.
 */
function describeProfile(choices: SwipeChoice[]): string {
  const parts = choices
    .map((c) => {
      const chosen = c.choice?.trim();
      if (!chosen) return null;
      if (c.axis?.trim() && c.rejected?.trim()) return `${c.axis.trim()} → ${chosen} (over ${c.rejected.trim()})`;
      return chosen;
    })
    .filter((x): x is string => !!x);
  return parts.length ? parts.join('; ') : 'a great all-rounder';
}

/**
 * Map an LLM candidate into a Restaurant-shaped option. Location-based picks (venues,
 * destinations) get a Google Maps link; abstract picks (movie titles, etc.) get a plain web
 * search link and no made-up address.
 */
function candidateToRestaurant(c: Candidate): Restaurant {
  const loc = c.location?.trim();
  if (c.locationBased) {
    const query = encodeURIComponent(loc ? `${c.name} ${loc}` : c.name);
    return {
      id: `ai_${slug(c.name)}`,
      name: c.name,
      category: c.category,
      priceLevel: c.priceLevel,
      rating: c.rating,
      address: loc,
      source: 'places',
      mapUrl: `https://www.google.com/maps/search/?api=1&query=${query}`,
    };
  }
  // Abstract pick (e.g. a movie title) — no location; link to a web search instead of a map.
  return {
    id: `ai_${slug(c.name)}`,
    name: c.name,
    category: c.category,
    rating: c.rating,
    source: 'freetext',
    mapUrl: `https://www.google.com/search?q=${encodeURIComponent(c.name)}`,
  };
}

// ---- Mock scoring heuristics ----

function scoreAgainstProfile(r: Restaurant, choices: SwipeChoice[]): number {
  let score = (r.rating ?? 4) ; // base on rating
  for (const c of choices) {
    const pick = c.pick;
    // Map known axes onto restaurant attributes.
    if (c.cardId.includes('budget')) {
      const wantsCheap = pick === 'left';
      const cheap = (r.priceLevel ?? 2) <= 2;
      if (wantsCheap === cheap) score += 1.5;
    }
    if (c.cardId.includes('vibe')) {
      const wantsFancy = pick === 'right';
      const fancy = (r.priceLevel ?? 2) >= 3;
      if (wantsFancy === fancy) score += 1.5;
    }
    if (c.cardId.includes('adventure')) {
      const wantsAdventurous = pick === 'right';
      const adventurous = ['Indian', 'Vietnamese', 'Japanese', 'Seafood', 'French', 'BBQ'].includes(r.category ?? '');
      if (wantsAdventurous === adventurous) score += 1.2;
    }
    if (c.cardId.includes('pace')) {
      const wantsQuick = pick === 'left';
      const quick = (r.priceLevel ?? 2) <= 2;
      if (wantsQuick === quick) score += 0.8;
    }
    if (c.cardId.includes('volume')) {
      const wantsLively = pick === 'right';
      const lively = ['Tacos', 'Burgers', 'BBQ', 'Japanese'].includes(r.category ?? '');
      if (wantsLively === lively) score += 0.6;
    }
  }
  return score;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function freeTextRestaurant(name: string): Restaurant {
  return {
    id: `ft_${slug(name)}`,
    name: name.trim(),
    source: 'freetext',
  };
}

function mockCandidatesForProfile(choices: SwipeChoice[]): Restaurant[] {
  const scored = SAMPLE_RESTAURANTS.map((r) => ({ r, score: scoreAgainstProfile(r, choices) }));
  scored.sort((a, b) => b.score - a.score);
  // Add a little spread so it isn't always the same top items for identical swipes.
  return scored.slice(0, 4).map((s) => withMapUrl(s.r));
}

// ---- Live implementations (Google Places). Only used when not mocking. ----

async function placesFetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(PLACES_TIMEOUT_MS) ? PLACES_TIMEOUT_MS : 5000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Google Places request failed with status ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveRestaurantLive(name: string, loc?: LatLng): Promise<Restaurant> {
  const key = process.env.PLACES_API_KEY!;
  const body = {
    textQuery: loc ? `${name}` : `${name} ${DEFAULT_CITY}`,
    ...(loc
      ? { locationBias: { circle: { center: { latitude: loc.lat, longitude: loc.lng }, radius: 8000 } } }
      : {}),
    maxResultCount: 1,
  };
  const json = await placesFetchJson<any>('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.rating,places.priceLevel,places.googleMapsUri,places.primaryTypeDisplayName',
    },
    body: JSON.stringify(body),
  }).catch(() => ({ places: [] }));
  const p = json.places?.[0];
  if (!p) {
    return freeTextRestaurant(name);
  }
  return placeToRestaurant(p);
}

async function candidatesForProfileLive(choices: SwipeChoice[], loc?: LatLng): Promise<Restaurant[]> {
  const key = process.env.PLACES_API_KEY!;
  // Turn the swipe profile into a text query.
  const wantsCheap = choices.find((c) => c.cardId.includes('budget'))?.pick === 'left';
  const wantsFancy = choices.find((c) => c.cardId.includes('vibe'))?.pick === 'right';
  const adventurous = choices.find((c) => c.cardId.includes('adventure'))?.pick === 'right';
  const descriptors = [
    wantsFancy ? 'upscale' : 'casual',
    wantsCheap ? 'affordable' : '',
    adventurous ? 'unique cuisine' : 'popular',
    'restaurant',
  ]
    .filter(Boolean)
    .join(' ');
  const body = {
    textQuery: `${descriptors} ${loc ? '' : DEFAULT_CITY}`.trim(),
    ...(loc
      ? { locationBias: { circle: { center: { latitude: loc.lat, longitude: loc.lng }, radius: 8000 } } }
      : {}),
    maxResultCount: 4,
  };
  const json = await placesFetchJson<any>('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.rating,places.priceLevel,places.googleMapsUri,places.primaryTypeDisplayName',
    },
    body: JSON.stringify(body),
  }).catch(() => ({ places: [] }));
  const places = (json.places ?? []).slice(0, 4).map(placeToRestaurant);
  return places.length > 0 ? places : mockCandidatesForProfile(choices);
}

function placeToRestaurant(p: any): Restaurant {
  const priceMap: Record<string, number> = {
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  return {
    id: p.id,
    name: p.displayName?.text ?? 'Unknown',
    category: p.primaryTypeDisplayName?.text,
    priceLevel: priceMap[p.priceLevel] ?? undefined,
    rating: p.rating,
    address: p.formattedAddress,
    mapUrl: p.googleMapsUri,
    source: 'places',
  };
}

export interface PlaceSuggestion {
  placeId: string;
  name: string;
  description: string;
}

export async function autocompleteRestaurants(query: string, loc?: LatLng): Promise<PlaceSuggestion[]> {
  if (USE_MOCKS) {
    const matches = SAMPLE_RESTAURANTS
      .filter((r) => r.name.toLowerCase().includes(query.toLowerCase()))
      .map((r) => ({ placeId: r.id, name: r.name, description: r.address ?? DEFAULT_CITY }));
    if (matches.length > 0) return matches;
    // No sample restaurants matched — return a free-text fallback so the user
    // can always confirm whatever they typed (mirrors resolveRestaurant() behaviour).
    return [{ placeId: `ft_${slug(query)}`, name: query.trim(), description: 'Free text entry' }];
  }
  return autocompleteRestaurantsLive(query, loc);
}

async function autocompleteRestaurantsLive(query: string, loc?: LatLng): Promise<PlaceSuggestion[]> {
  const key = process.env.PLACES_API_KEY!;
  const body: Record<string, unknown> = { input: loc ? query : `${query} ${DEFAULT_CITY}` };
  if (loc) {
    body.locationBias = { circle: { center: { latitude: loc.lat, longitude: loc.lng }, radius: 8000 } };
  }
  const json = await placesFetchJson<any>('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': AUTOCOMPLETE_FIELD_MASK,
    },
    body: JSON.stringify(body),
  }).catch(() => ({ suggestions: [] }));
  return (json.suggestions ?? [])
    .filter((s: any) => s.placePrediction)
    .map((s: any) => ({
      placeId: s.placePrediction.placeId,
      name: s.placePrediction.structuredFormat?.mainText?.text ?? s.placePrediction.text?.text ?? '',
      description: s.placePrediction.structuredFormat?.secondaryText?.text ?? '',
    }));
}

export async function resolveRestaurantById(placeId: string): Promise<Restaurant> {
  if (USE_MOCKS) {
    const hit = SAMPLE_RESTAURANTS.find((r) => r.id === placeId);
    if (hit) return withMapUrl(hit);
    // Reconstruct a human-readable name from free-text placeIds (ft_<slug>).
    const freetextName = placeId.startsWith('ft_')
      ? placeId.slice(3).replace(/-+/g, ' ')
      : placeId;
    return withMapUrl({ id: placeId, name: freetextName, source: 'freetext' });
  }
  return resolveRestaurantByIdLive(placeId);
}

async function resolveRestaurantByIdLive(placeId: string): Promise<Restaurant> {
  const key = process.env.PLACES_API_KEY!;
  const p = await placesFetchJson<any>(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask':
        'id,displayName,formattedAddress,rating,priceLevel,googleMapsUri,primaryTypeDisplayName',
    },
  });
  if (!p.id) throw new Error('Place not found');
  return placeToRestaurant(p);
}

/** A random sample restaurant — used to give test bots a pick. Works offline. */
export function randomSampleRestaurant(): Restaurant {
  const r = SAMPLE_RESTAURANTS[Math.floor(Math.random() * SAMPLE_RESTAURANTS.length)];
  return withMapUrl(r);
}

export const placesConfig = { USE_MOCKS, DEFAULT_CITY };
