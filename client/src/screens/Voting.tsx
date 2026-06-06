import { useMemo, useState } from 'react';
import { useGame, useMe } from '../lib/socket.tsx';
import { useToast } from '../components/Toast.tsx';
import { WaitingFor } from '../components/WaitingFor.tsx';
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
      if (cur.length >= 3) return cur; // cap at top-3
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
      <div className="screen voting">
        <Countdown />
        <h2 className="phase-title">Vote cast! 🗳️</h2>
        <WaitingFor
          label="Waiting for everyone to vote…"
          done={players.filter((p) => p.hasVoted).length}
          total={players.length}
          players={players}
          isDone={(p) => p.hasVoted}
        />
        <HostSkip label="Skip to results ⏭" />
      </div>
    );
  }

  return (
    <div className="screen voting">
      <Countdown />
      <div className="round-head">
        <span className="round-pill">
          Round {(room?.round ?? 0) + 1} / {room?.totalRounds}
        </span>
        <h2 className="round-prompt">{room?.roundPrompt}</h2>
        <p className="hint">Tap your top 3 in order. You can’t vote for yourself.</p>
      </div>

      <div className="vote-grid">
        {cards.map((c, i) => {
          const rank = ranked.indexOf(c.authorId);
          return (
            <button
              key={c.id}
              className={`answer-card tilt-${i % 4} ${rank > -1 ? 'picked' : ''}`}
              onClick={() => toggle(c.authorId)}
            >
              {rank > -1 && <span className="rank-badge">{RANK_LABELS[rank]}</span>}
              <span className="answer-text">{c.text}</span>
            </button>
          );
        })}
      </div>

      <button className="btn btn-primary big sticky-submit" disabled={busy || ranked.length === 0} onClick={submit}>
        {busy ? 'Sending…' : `Submit ${ranked.length ? `(${ranked.length})` : 'votes'}`}
      </button>
      <HostSkip label="Skip to results ⏭" />
    </div>
  );
}
