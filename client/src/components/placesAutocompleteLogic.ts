export const MIN_AUTOCOMPLETE_QUERY_LENGTH = 2;
export const AUTOCOMPLETE_ACK_TIMEOUT_MS = 3000;

interface AutocompleteAck<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export function isAutocompleteQueryReady(query: string): boolean {
  return query.trim().length >= MIN_AUTOCOMPLETE_QUERY_LENGTH;
}

export async function withAutocompleteTimeout<T>(
  request: Promise<AutocompleteAck<T>>,
  timeoutMs = AUTOCOMPLETE_ACK_TIMEOUT_MS,
): Promise<AutocompleteAck<T>> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<AutocompleteAck<T>>((resolve) => {
    timeout = setTimeout(() => resolve({ ok: false, error: 'Autocomplete timed out' }), timeoutMs);
  });

  try {
    return await Promise.race([request, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function autocompleteFallbackSuggestion(query: string) {
  const name = query.trim();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return { placeId: `ft_${slug}`, name, description: 'Free text entry' };
}
