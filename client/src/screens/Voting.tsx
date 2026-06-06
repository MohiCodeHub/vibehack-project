import { useMemo, useState } from 'react';
import { Vote, Check } from 'lucide-react';
import { motion as Motion } from 'motion/react';
import { useGame, useMe } from '../lib/socket.tsx';
import { useToast } from '../components/Toast.tsx';
import { WaitingFor } from '../components/WaitingFor.tsx';
import { Screen } from '../components/layout/Screen.tsx';
import { Button } from '../components/ui';
import { Countdown } from '../components/Countdown.tsx';
import { HostSkip } from '../components/HostSkip.tsx';

const RANK_LABELS = ['🥇 +3', '🥈 +2', '🥉 +1'];

export function Voting() {
  const { room, emit, playerId } = useGame();
  const me = useMe();
  const { show } = useToast();
  const [ranked, setRanked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const cards = useMemo(
    () => (room?.voteCards ?? []).filter((c) => c.authorId !== playerId),
    [room?.voteCards, playerId],
  );
  const submitted = me?.hasVoted;

  function toggle(authorId: string) {
    setRanked((cur) => {
      if (cur.includes(authorId)) return cur.filter((id) => id !== authorId);
      if (cur.length >= 3) return cur;
      return [...cur, authorId];
    });
  }

  async function submit() {
    if (ranked.length === 0) return show('Pick at least one');
    setBusy(true);
    const ack = await emit('vote:submit', { ranked });
    setBusy(false);
    if (!ack.ok) show(ack.error ?? 'Could not vote');
  }

  if (submitted) {
    const players = room?.players.filter((p) => p.connected && p.hasRestaurant) ?? [];
    return (
      <Screen center className="voting">
        <Countdown />
        <WaitingFor
          label="VOTE CAST!"
          done={players.filter((p) => p.hasVoted).length}
          total={players.length}
          players={players}
          isDone={(p) => p.hasVoted}
          icon="clock"
        />
        <HostSkip label="Skip to results ⏭" />
      </Screen>
    );
  }

  return (
    <Screen className="voting">
      <Countdown />
      <div className="vote-round-head">
        <span className="vote-round-pill">
          Round {(room?.round ?? 0) + 1} / {room?.totalRounds}
        </span>
        <h2 className="vote-round-prompt">{room?.roundPrompt}</h2>
        <p className="phase-sub">Pick your top 3 in order. You can&apos;t vote for yourself.</p>
      </div>

      <div className="vote-list">
        {cards.map((c, i) => {
          const rank = ranked.indexOf(c.authorId);
          return (
            <Motion.button
              key={c.id}
              type="button"
              initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`vote-card${rank > -1 ? ' vote-card--picked' : ''}`}
              onClick={() => toggle(c.authorId)}
            >
              {rank > -1 && <span className="vote-card__rank">{RANK_LABELS[rank]}</span>}
              <p className="vote-card__text">&ldquo;{c.text}&rdquo;</p>
              {rank > -1 && (
                <span style={{ position: 'absolute', top: -8, right: -8 }}>
                  <Check size={16} />
                </span>
              )}
            </Motion.button>
          );
        })}
      </div>

      <div className="vote-footer">
        <div className="vote-rank-dots">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`vote-rank-dot${ranked.length >= n ? ' vote-rank-dot--filled' : ''}`}>
              {n}
            </div>
          ))}
        </div>
        <Button
          variant={ranked.length === 0 || busy ? 'disabled' : 'success'}
          size="sm"
          block={false}
          disabled={busy || ranked.length === 0}
          onClick={submit}
        >
          {busy ? 'Sending…' : 'CAST VOTE'} <Vote size={20} />
        </Button>
        <HostSkip label="Skip to results ⏭" />
      </div>
    </Screen>
  );
}
