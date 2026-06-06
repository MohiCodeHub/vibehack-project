import type { PlayerView } from '@shared/types.ts';

/** Shared "waiting for others" panel with per-player done ticks. */
export function WaitingFor({
  label,
  done,
  total,
  players,
  isDone,
}: {
  label: string;
  done: number;
  total: number;
  players: PlayerView[];
  isDone: (p: PlayerView) => boolean;
}) {
  return (
    <div className="waiting">
      <p className="waiting-label pulse">{label}</p>
      <div className="waiting-bar">
        <div className="waiting-fill" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
      <p className="waiting-count">
        {done} / {total} ready
      </p>
      <ul className="waiting-list">
        {players.map((p) => (
          <li key={p.id} className={isDone(p) ? 'ok' : ''}>
            <span className="tickmark">{isDone(p) ? '✓' : '…'}</span> {p.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
