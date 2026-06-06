import { useGame } from '../lib/socket.tsx';

/** Tiny connection indicator so players can see reconnect state. */
export function ConnBadge() {
  const { connected } = useGame();
  return (
    <div className={`conn-badge ${connected ? 'on' : 'off'}`} aria-live="polite">
      <span className="dot" />
      {connected ? 'Live' : 'Reconnecting…'}
    </div>
  );
}
