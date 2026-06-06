import { useEffect, useState } from 'react';
import { MapPin, RotateCcw, Star } from 'lucide-react';
import confetti from 'canvas-confetti';
import { motion as Motion } from 'motion/react';
import { useGame, useMe } from '../lib/socket.tsx';
import { LeaderboardList } from '../components/LeaderboardList.tsx';
import { clearLastRoom } from '../lib/identity.ts';
import { Screen } from '../components/layout/Screen.tsx';
import { Button, Card } from '../components/ui';

export function Final() {
  const { room, emit, setRoom } = useGame();
  const me = useMe();
  const [showWinner, setShowWinner] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowWinner(true);
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#fbbf24', '#f87171', '#34d399', '#60a5fa'],
      });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []);

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

  function openMap() {
    const r = winner?.restaurant;
    if (!r) return;
    const url = r.mapUrl ?? `https://www.google.com/maps/search/${encodeURIComponent(r.name)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <Screen center className="final">
      {!showWinner ? (
        <Motion.h2
          className="final-suspense"
          animate={{ scale: [1, 1.08, 1], rotate: [0, 3, -3, 0] }}
          transition={{ duration: 0.5, repeat: Infinity }}
        >
          AND THE WINNER IS…
        </Motion.h2>
      ) : winner ? (
        <Motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-8)' }}
        >
          <div style={{ textAlign: 'center' }}>
            <p className="final-kicker">We have a decision!</p>
            <h1 className="final-winner-name">{winner.restaurant.name}</h1>
            <p className="phase-sub">Championed by {winner.playerName} 🏆</p>
          </div>

          <Card variant="elevated" padding="lg" className="final-detail-card">
            <div className="final-champ-badge">CHAMPION</div>
            {winner.restaurant.rating != null && (
              <div className="final-stars">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    size={20}
                    fill={n <= Math.round(winner.restaurant.rating!) ? 'currentColor' : 'none'}
                  />
                ))}
              </div>
            )}
            {winner.restaurant.category && (
              <p className="phase-sub" style={{ textAlign: 'center', color: 'var(--ds-color-input-text)' }}>
                {winner.restaurant.category}
                {winner.restaurant.address ? ` · ${winner.restaurant.address}` : ''}
              </p>
            )}
            <div className="final-map-placeholder">
              <MapPin size={48} color="var(--ds-color-primary)" />
            </div>
          </Card>

          <div>
            <h3 className="phase-title" style={{ fontSize: 'var(--ds-text-xl)', marginBottom: 'var(--ds-space-4)' }}>
              Final standings
            </h3>
            <LeaderboardList players={room.players} youId={me?.id} />
          </div>

          <div className="final-actions">
            <Button variant="success" size="lg" block onClick={openMap}>
              GO NOW! <MapPin size={24} />
            </Button>
            {isHost ? (
              <Button variant="accent" size="lg" block onClick={playAgain}>
                AGAIN? <RotateCcw size={24} />
              </Button>
            ) : (
              <Button variant="ghost" size="lg" block onClick={leave}>
                Leave
              </Button>
            )}
          </div>
          {isHost && (
            <Button variant="ghost" onClick={leave}>
              Leave room
            </Button>
          )}
        </Motion.div>
      ) : (
        <p className="hint">No winner — something went sideways.</p>
      )}
    </Screen>
  );
}
