import { ArrowRight } from 'lucide-react';
import { useGame, useMe } from '../lib/socket.tsx';
import { LeaderboardList } from '../components/LeaderboardList.tsx';
import { Screen } from '../components/layout/Screen.tsx';
import { Button } from '../components/ui';

export function Leaderboard() {
  const { room, emit } = useGame();
  const me = useMe();
  if (!room) return null;

  const isHost = me?.isHost;
  const isLast = room.round + 1 >= room.totalRounds;

  return (
    <Screen className="leaderboard">
      <div style={{ textAlign: 'center' }}>
        <h2 className="phase-title phase-title--lg">LEADERBOARD</h2>
        <p className="phase-sub">
          {isLast ? 'Final scores!' : `Round ${room.round + 1} of ${room.totalRounds}`}
        </p>
      </div>

      <LeaderboardList players={room.players} youId={me?.id} />

      <div className="screen__actions">
        {isHost ? (
          <Button variant="secondary" size="lg" onClick={() => emit('round:next')}>
            {isLast ? 'FINAL RESULTS' : 'NEXT ROUND'} <ArrowRight size={32} />
          </Button>
        ) : (
          <div className="host-wait-banner">Waiting for host…</div>
        )}
      </div>
    </Screen>
  );
}
