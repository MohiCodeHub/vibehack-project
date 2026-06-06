import { useGame } from '../lib/socket.tsx';

/** Tiny connection indicator so players can see connect / reconnect state. */
export function ConnBadge() {
  const { connected, everConnected } = useGame();
  const label = connected ? 'Live' : everConnected ? 'Reconnecting…' : 'Connecting…';
  return (
    <div className={`conn-badge ${connected ? 'on' : 'off'}`} aria-live="polite">
      <span className="dot" />
      {label}
    </div>
  );
}
