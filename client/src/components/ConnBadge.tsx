import { useGame } from '../lib/socket.tsx';

export function ConnBadge() {
  const { connected, everConnected } = useGame();
  const label = connected ? 'Live' : everConnected ? 'Reconnecting…' : 'Connecting…';
  return (
    <div className={`conn-badge${connected ? '' : ' conn-badge--off'}`} aria-live="polite">
      <span className="conn-badge__dot" />
      {label}
    </div>
  );
}
