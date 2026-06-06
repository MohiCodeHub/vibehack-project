import { useGame, useMe } from '../lib/socket.tsx';
import { RestaurantCard } from '../components/RestaurantCard.tsx';
import { LeaderboardList } from '../components/LeaderboardList.tsx';
import { clearLastRoom } from '../lib/identity.ts';

export function Final() {
  const { room, emit, setRoom } = useGame();
  const me = useMe();
  if (!room) return null;

  const isHost = me?.isHost;
  const winner = room.winner;

  function playAgain() {
    emit('room:reset');
  }
  function leave() {
    clearLastRoom();
    setRoom(null);
    window.location.reload();
  }

  return (
    <div className="screen final">
      <div className="confetti" aria-hidden />
      <p className="final-kicker">Where you’re going</p>
      {winner ? (
        <>
          <div className="winner-spotlight">
            <RestaurantCard r={winner.restaurant} championed />
          </div>
          <p className="final-champ">
            Championed by <strong>{winner.playerName}</strong> 🏆
          </p>
        </>
      ) : (
        <p className="hint">No winner — something went sideways.</p>
      )}

      <h3 className="section-head">Final standings</h3>
      <LeaderboardList players={room.players} youId={me?.id} />

      <div className="lobby-actions">
        {isHost && (
          <button className="btn btn-primary big" onClick={playAgain}>
            Play again
          </button>
        )}
        <button className="btn btn-ghost" onClick={leave}>
          Leave
        </button>
      </div>
    </div>
  );
}
