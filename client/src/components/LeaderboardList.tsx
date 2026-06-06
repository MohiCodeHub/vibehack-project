import type { PlayerView } from '@shared/types.ts';
import { motion as Motion } from 'motion/react';
import { playerColor } from './ui/utils.ts';

const MEDALS = ['🥇', '🥈', '🥉'];

export function LeaderboardList({ players, youId }: { players: PlayerView[]; youId?: string }) {
  const sorted = [...players].filter((p) => p.hasRestaurant).sort((a, b) => b.score - a.score);

  return (
    <ol className="lb-list">
      {sorted.map((p, i) => (
        <Motion.li
          key={p.id}
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: i * 0.1 }}
          className={`lb-row${p.id === youId ? ' lb-row--you' : ''}${i === 0 ? ' lb-row--first' : ''}`}
        >
          <span className="lb-row__rank" style={{ backgroundColor: playerColor(i) }}>
            {MEDALS[i] ?? i + 1}
          </span>
          <div className="lb-row__main">
            <p className="lb-row__name">{p.name}</p>
            {p.restaurantName && <p className="lb-row__resto">Championing: {p.restaurantName}</p>}
          </div>
          <span className="lb-row__score">{p.score}</span>
        </Motion.li>
      ))}
    </ol>
  );
}
