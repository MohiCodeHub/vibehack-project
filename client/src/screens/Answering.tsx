import { useState } from 'react';
import { useGame, useMe } from '../lib/socket.tsx';
import { useToast } from '../components/Toast.tsx';
import { WaitingFor } from '../components/WaitingFor.tsx';

export function Answering() {
  const { room, priv, emit } = useGame();
  const me = useMe();
  const { show } = useToast();
  const questions = priv?.questions ?? [];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submitted = me?.hasAnswered;
  const allFilled = questions.length > 0 && questions.every((q) => (answers[q.id] ?? '').trim());

  async function submit() {
    if (!allFilled) return show('Answer all three');
    setBusy(true);
    const ack = await emit('answers:submit', { answers });
    setBusy(false);
    if (!ack.ok) show(ack.error ?? 'Could not submit');
  }

  if (submitted) {
    const players = room?.players.filter((p) => p.connected && p.hasRestaurant) ?? [];
    return (
      <div className="screen answering">
        <h2 className="phase-title">Answers in! ✍️</h2>
        <WaitingFor
          label="Waiting for everyone to answer…"
          done={players.filter((p) => p.hasAnswered).length}
          total={players.length}
          players={players}
          isDone={(p) => p.hasAnswered}
        />
      </div>
    );
  }

  return (
    <div className="screen answering">
      <h2 className="phase-title">Your questions</h2>
      <p className="hint">Be funny. You’ll vote on the best answers next.</p>
      <div className="q-list">
        {questions.map((q, i) => (
          <div key={q.id} className="q-card">
            <div className="q-num">Q{i + 1}</div>
            <p className="q-text">{q.text}</p>
            <textarea
              className="q-input"
              maxLength={280}
              rows={2}
              placeholder="Your answer…"
              value={answers[q.id] ?? ''}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <button className="btn btn-primary big sticky-submit" disabled={busy || !allFilled} onClick={submit}>
        {busy ? 'Sending…' : 'Submit answers'}
      </button>
    </div>
  );
}
