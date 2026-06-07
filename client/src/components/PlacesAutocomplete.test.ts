import assert from 'node:assert/strict';
import { test } from 'node:test';

import { withAutocompleteTimeout } from './placesAutocompleteLogic.ts';
import { isAutocompleteQueryReady } from './placesAutocompleteLogic.ts';

test('autocomplete waits until a query has at least two meaningful characters', () => {
  assert.equal(isAutocompleteQueryReady(''), false);
  assert.equal(isAutocompleteQueryReady(' a '), false);
  assert.equal(isAutocompleteQueryReady('ab'), true);
});

test('autocomplete request timeout resolves instead of hanging forever', async () => {
  const hangingRequest = new Promise<{ ok: boolean; error?: string }>(() => {});
  const ack = await withAutocompleteTimeout(hangingRequest, 1);

  assert.deepEqual(ack, { ok: false, error: 'Autocomplete timed out' });
});
