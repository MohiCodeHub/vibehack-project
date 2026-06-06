export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** Map a player index (0–5) to the Figma player palette. */
export function playerColor(index: number): string {
  const colors = [
    'var(--ds-color-player-1)',
    'var(--ds-color-player-2)',
    'var(--ds-color-player-3)',
    'var(--ds-color-player-4)',
    'var(--ds-color-player-5)',
    'var(--ds-color-player-6)',
  ];
  return colors[index % colors.length];
}
