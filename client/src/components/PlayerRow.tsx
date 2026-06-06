import type { PlayerView } from '@shared/types.ts';

const COLORS = ['#ff5d8f', '#ffd23f', '#3bceac', '#5b8cff', '#c77dff', '#ff8c42'];

function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function PlayerRow({
  p,
  youId,
  status,
}: {
  p: PlayerView;
  youId?: string;
  status?: React.ReactNode;
}) {
  return (
    <li className={`player-row ${p.connected ? '' : 'disconnected'}`}>
      <span className="avatar" style={{ background: colorFor(p.id) }}>
        {p.name.slice(0, 1).toUpperCase()}
      </span>
      <span className="player-name">
        {p.name}
        {p.id === youId && <span className="you-tag"> you</span>}
        {p.isHost && <span className="host-tag"> host</span>}
        {p.isBot && <span className="bot-tag"> 🤖 bot</span>}
      </span>
      <span className="player-status">
        {!p.connected && <span className="status-off">offline</span>}
        {status}
      </span>
    </li>
  );
}
