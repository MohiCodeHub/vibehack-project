// Comic-style podium medals (inline SVG) for the top 3 leaderboard spots.
// Chunky black outlines match the arcade card/button style — and keep the medal
// legible even on the gold first-place row. 4th+ use plain number badges.

const BORDER = '#000000';

const MEDAL: Record<number, { face: string; ring: string; num: string }> = {
  1: { face: '#fbbf24', ring: '#b45309', num: '#3a2200' }, // gold
  2: { face: '#e2e8f0', ring: '#94a3b8', num: '#334155' }, // silver
  3: { face: '#e8a06a', ring: '#a85a1e', num: '#4a2308' }, // bronze
};

export function RankMedal({ rank }: { rank: number }) {
  const m = MEDAL[rank] ?? MEDAL[3];
  return (
    <svg className="lb-rank-medal" viewBox="0 0 56 72" role="img" aria-label={`Rank ${rank}`}>
      {/* ribbon tails (drawn first, tucked behind the medallion) */}
      <rect x="14" y="2" width="12" height="36" rx="2" fill="#f87171" stroke={BORDER} strokeWidth="4" transform="rotate(-17 20 20)" />
      <rect x="30" y="2" width="12" height="36" rx="2" fill="#f87171" stroke={BORDER} strokeWidth="4" transform="rotate(17 36 20)" />
      {/* medallion */}
      <circle cx="28" cy="48" r="21" fill={m.face} stroke={BORDER} strokeWidth="5" />
      <circle cx="28" cy="48" r="14.5" fill="none" stroke={m.ring} strokeWidth="3" />
      {/* shine */}
      <path d="M18 41 Q21 35 28 34" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity="0.65" />
      {/* rank number */}
      <text
        x="28"
        y="56"
        textAnchor="middle"
        fontFamily="system-ui, sans-serif"
        fontWeight="900"
        fontSize="23"
        fill={m.num}
      >
        {rank}
      </text>
    </svg>
  );
}
