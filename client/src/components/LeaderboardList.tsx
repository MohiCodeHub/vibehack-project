import type { PlayerView } from '@shared/types.ts';

const MEDALS = ['🥇', '🥈', '🥉'];

/** Animated, score-sorted leaderboard. Bars grow + rows slide into rank order. */
export function LeaderboardList({ players, youId }: { players: PlayerView[]; youId?: string }) {
  const sorted = [...players].filter((p) => p.hasRestaurant).sort((a, b) => b.score - a.score);
  const max = Math.max(1, ...sorted.map((p) => p.score));

  return (
    <ol className="lb-list">
      {sorted.map((p, i) => (
        <li
          key={p.id}
          className={`lb-row ${p.id === youId ? 'you' : ''} ${i === 0 ? 'leader' : ''}`}
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <span className="lb-rank">{MEDALS[i] ?? i + 1}</span>
          <div className="lb-main">
            <div className="lb-name">
              {p.name}
              {p.restaurantName && <span className="lb-resto"> · {p.restaurantName}</span>}
            </div>
            <div className="lb-track">
              <div className="lb-bar" style={{ width: `${(p.score / max) * 100}%` }} />
            </div>
          </div>
          <span className="lb-score">{p.score}</span>
        </li>
      ))}
    </ol>
  );
}
