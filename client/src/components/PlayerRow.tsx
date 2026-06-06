import type { PlayerView } from '@shared/types.ts';
import type { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { motion as Motion } from 'motion/react';
import { Badge } from './ui/Badge.tsx';
import { playerColor } from './ui/utils.ts';

export function PlayerTile({
  p,
  youId,
  index,
}: {
  p: PlayerView;
  youId?: string;
  index: number;
}) {
  return (
    <Motion.li
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className={`player-tile${p.connected ? '' : ' player-tile--offline'}`}
      style={{ borderLeftColor: playerColor(index) }}
    >
      <span className="player-tile__name">
        {p.name}
        {p.id === youId && ' (you)'}
      </span>
      {p.isHost && <ShieldCheck size={16} aria-label="Host" />}
      {p.isBot && <Badge variant="bot">bot</Badge>}
      {!p.connected && <Badge variant="outline">offline</Badge>}
    </Motion.li>
  );
}

export function PlayerTileGhost() {
  return <li className="player-tile player-tile--ghost">Waiting…</li>;
}

/** @deprecated Use PlayerTile in grid layout — kept for WaitingFor list */
export function PlayerRow({
  p,
  youId,
  status,
}: {
  p: PlayerView;
  youId?: string;
  status?: ReactNode;
}) {
  let h = 0;
  for (let i = 0; i < p.id.length; i++) h = (h * 31 + p.id.charCodeAt(i)) >>> 0;

  return (
    <li className={`player-tile${p.connected ? '' : ' player-tile--offline'}`} style={{ borderLeftColor: playerColor(h % 6) }}>
      <span className="player-tile__name">
        {p.name}
        {p.id === youId && ' (you)'}
        {p.isHost && ' 👑'}
        {p.isBot && ' 🤖'}
      </span>
      {!p.connected && <span className="hint">offline</span>}
      {status}
    </li>
  );
}
