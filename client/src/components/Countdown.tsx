import { useEffect, useState } from 'react';
import { useGame } from '../lib/socket.tsx';

/**
 * Renders the time left in the current timed phase, counting down from the
 * server-authoritative room.deadlineTs. Shows nothing when the phase is untimed.
 */
export function Countdown() {
  const { room } = useGame();
  const deadline = room?.deadlineTs ?? null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [deadline]);

  if (!deadline) return null;
  const secs = Math.max(0, Math.ceil((deadline - now) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return (
    <div className={`countdown ${secs <= 10 ? 'low' : ''}`} aria-label="time remaining">
      ⏱ {m}:{s.toString().padStart(2, '0')}
    </div>
  );
}
