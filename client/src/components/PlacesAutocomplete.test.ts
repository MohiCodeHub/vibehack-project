import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isAutocompleteQueryReady } from './placesAutocompleteLogic.ts';

test('autocomplete waits until a query has at least two meaningful characters', () => {
  assert.equal(isAutocompleteQueryReady(''), false);
  assert.equal(isAutocompleteQueryReady(' a '), false);
  assert.equal(isAutocompleteQueryReady('ab'), true);
});
