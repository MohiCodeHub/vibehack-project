import type { PlayerView } from '@shared/types.ts';
import { motion as Motion } from 'motion/react';
import { Sparkles, Clock } from 'lucide-react';

/** Shared "waiting for others" panel with per-player done ticks. */
export function WaitingFor({
  label,
  done,
  total,
  players,
  isDone,
  icon = 'sparkles',
}: {
  label: string;
  done: number;
  total: number;
  players: PlayerView[];
  isDone: (p: PlayerView) => boolean;
  icon?: 'sparkles' | 'clock';
}) {
  const Icon = icon === 'clock' ? Clock : Sparkles;

  return (
    <div className="waiting-panel">
      <Motion.div
        animate={icon === 'sparkles' ? { rotate: 360 } : { y: [0, -10, 0] }}
        transition={
          icon === 'sparkles'
            ? { duration: 2, repeat: Infinity, ease: 'linear' }
            : { duration: 1.5, repeat: Infinity }
        }
        className="waiting-panel__icon"
      >
        <Icon size={64} />
      </Motion.div>
      <h2 className="waiting-panel__label">{label}</h2>
      <div className="waiting-panel__bar">
        <div className="waiting-panel__fill" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
      <p className="waiting-panel__count">
        {done} / {total} ready
      </p>
      <ul className="waiting-panel__list">
        {players.map((p) => (
          <li key={p.id} className={isDone(p) ? 'is-done' : ''}>
            <span>{isDone(p) ? '✓' : '…'}</span> {p.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
