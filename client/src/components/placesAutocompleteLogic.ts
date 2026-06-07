export const MIN_AUTOCOMPLETE_QUERY_LENGTH = 2;

export function isAutocompleteQueryReady(query: string): boolean {
  return query.trim().length >= MIN_AUTOCOMPLETE_QUERY_LENGTH;
}
