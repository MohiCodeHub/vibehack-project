// Input sanitization for client payloads (Section 3). Every payload from a client
// is hostile until cleaned — not usually malicious, just a player named "" or a
// 20kb pasted answer that would break the layout. Keep these helpers dumb + total.

// Strip ASCII control chars (incl. newlines/tabs) so names/codes stay single-line.
const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;

/** Trim, strip control chars, and hard-cap length. Returns '' for non-strings. */
export function cleanText(s: unknown, max: number): string {
  if (typeof s !== 'string') return '';
  return s.replace(CONTROL_CHARS, '').trim().slice(0, max);
}

/** Player display name: 1–20 chars. */
export function cleanName(s: unknown): string {
  return cleanText(s, 20);
}

/** Custom decision topic shown in lobby (e.g. "Restaurant for dinner"). */
export function cleanDecisionTopic(s: unknown): string {
  return cleanText(s, 100);
}

/** Manually-typed restaurant name: 1–60 chars. */
export function cleanRestaurantName(s: unknown): string {
  return cleanText(s, 60);
}

const CODE_RE = /^[A-Z]{4}$/;

/** Normalize a room code to 4 uppercase letters, or null if it can't be one. */
export function cleanCode(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const up = s.trim().toUpperCase();
  return CODE_RE.test(up) ? up : null;
}
