import { useGame, useMe } from '../lib/socket.tsx';
import { useToast } from './Toast.tsx';

/**
 * Host-only "force the phase forward" button — the live-demo escape hatch when a
 * round is waiting on a submission that may never arrive. Renders nothing for non-hosts.
 */
export function HostSkip({ label = 'Skip ahead ⏭' }: { label?: string }) {
  const { emit } = useGame();
  const me = useMe();
  const { show } = useToast();
  if (!me?.isHost) return null;

  async function skip() {
    const ack = await emit('host:next');
    if (!ack.ok) show(ack.error ?? 'Could not skip');
  }

  return (
    <button className="btn btn-ghost skip-btn" onClick={skip}>
      {label}
    </button>
  );
}
