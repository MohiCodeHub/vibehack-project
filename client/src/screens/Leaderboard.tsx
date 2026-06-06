import { useGame, useMe } from '../lib/socket.tsx';
import { LeaderboardList } from '../components/LeaderboardList.tsx';

export function Leaderboard() {
  const { room, emit } = useGame();
  const me = useMe();
  if (!room) return null;

  const isHost = me?.isHost;
  const isLast = room.round + 1 >= room.totalRounds;

  return (
    <div className="screen leaderboard">
      <h2 className="phase-title">
        {isLast ? 'Final scores!' : `After round ${room.round + 1}`}
      </h2>
      <LeaderboardList players={room.players} youId={me?.id} />
      <div className="lobby-actions">
        {isHost ? (
          <button className="btn btn-primary big" onClick={() => emit('round:next')}>
            {isLast ? '🎉 Reveal the winner' : 'Next round →'}
          </button>
        ) : (
          <p className="hint pulse">Waiting for host…</p>
        )}
      </div>
    </div>
  );
}
