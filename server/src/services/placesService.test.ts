import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
});

async function importLivePlacesService() {
  process.env.USE_MOCKS = 'false';
  process.env.PLACES_API_KEY = 'test-key';
  process.env.DEFAULT_CITY = 'London';
  return import(`./placesService.ts?test=${Date.now()}-${Math.random()}`);
}

test('live autocomplete bounds Google requests with a timeout signal and small field mask', async () => {
  const seen: RequestInit[] = [];
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    seen.push(init ?? {});
    return Response.json({ suggestions: [] });
  }) as typeof fetch;

  const { autocompleteRestaurants } = await importLivePlacesService();

  await autocompleteRestaurants('pizza');

  assert.equal(seen.length, 1);
  assert.ok(seen[0].signal instanceof AbortSignal);
  assert.equal(
    (seen[0].headers as Record<string, string>)['X-Goog-FieldMask'],
    'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text,suggestions.placePrediction.text.text',
  );
});

test('live autocomplete uses the default city when no user location is available', async () => {
  let body = '';
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    body = String(init?.body ?? '');
    return Response.json({ suggestions: [] });
  }) as typeof fetch;

  const { autocompleteRestaurants } = await importLivePlacesService();

  await autocompleteRestaurants('ramen');

  assert.deepEqual(JSON.parse(body), { input: 'ramen London' });
});

test('live autocomplete falls back to free text when Google returns no suggestions', async () => {
  globalThis.fetch = (async () => Response.json({ suggestions: [] })) as typeof fetch;

  const { autocompleteRestaurants } = await importLivePlacesService();

  assert.deepEqual(await autocompleteRestaurants('pastastation tottenham court road'), [
    {
      placeId: 'ft_pastastation-tottenham-court-road',
      name: 'pastastation tottenham court road',
      description: 'Free text entry',
    },
  ]);
});

test('live autocomplete falls back to free text when Google hangs', async () => {
  process.env.PLACES_TIMEOUT_MS = '10';
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    await new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    });
    return Response.json({ suggestions: [] });
  }) as typeof fetch;

  const { autocompleteRestaurants } = await importLivePlacesService();

  assert.deepEqual(await autocompleteRestaurants('pastastation tottenham court road'), [
    {
      placeId: 'ft_pastastation-tottenham-court-road',
      name: 'pastastation tottenham court road',
      description: 'Free text entry',
    },
  ]);
});

test('live place-id search accepts free-text autocomplete ids without calling Google', async () => {
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error('should not call Google for free-text ids');
  }) as typeof fetch;

  const { resolveRestaurantById } = await importLivePlacesService();

  assert.deepEqual(await resolveRestaurantById('ft_pastastation-tottenham-court-road'), {
    id: 'ft_pastastation-tottenham-court-road',
    name: 'pastastation tottenham court road',
    source: 'freetext',
    mapUrl: 'https://www.google.com/maps/search/?api=1&query=pastastation%20tottenham%20court%20road%20London',
  });
  assert.equal(fetchCalls, 0);
});

test('live restaurant search falls back to free text when Google fails', async () => {
  globalThis.fetch = (async () => {
    throw new Error('network unavailable');
  }) as typeof fetch;

  const { resolveRestaurant } = await importLivePlacesService();

  assert.deepEqual(await resolveRestaurant('Sushi House'), {
    id: 'ft_sushi-house',
    name: 'Sushi House',
    source: 'freetext',
  });
});

test('live swipe candidates fall back to sample restaurants when Google fails', async () => {
  globalThis.fetch = (async () => {
    throw new Error('network unavailable');
  }) as typeof fetch;

  const { candidatesForProfile } = await importLivePlacesService();
  const candidates = await candidatesForProfile([]);

  assert.equal(candidates.length, 4);
  assert.equal(candidates[0].source, 'places');
});
