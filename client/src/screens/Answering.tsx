import { useState } from 'react';
import { Send } from 'lucide-react';
import { AnimatePresence, motion as Motion } from 'motion/react';
import { useGame, useMe } from '../lib/socket.tsx';
import { useToast } from '../components/Toast.tsx';
import { WaitingFor } from '../components/WaitingFor.tsx';
import { Screen } from '../components/layout/Screen.tsx';
import { Button, Textarea } from '../components/ui';
import { Countdown } from '../components/Countdown.tsx';
import { HostSkip } from '../components/HostSkip.tsx';

export function Answering() {
  const { room, priv, emit } = useGame();
  const me = useMe();
  const { show } = useToast();
  const questions = priv?.questions ?? [];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [busy, setBusy] = useState(false);

  const submitted = me?.hasAnswered;
  const current = questions[currentQ];
  const currentFilled = current ? (answers[current.id] ?? '').trim().length > 0 : false;
  const allFilled = questions.length > 0 && questions.every((q) => (answers[q.id] ?? '').trim());

  async function submitAll() {
    if (!allFilled) return show('Answer all three');
    setBusy(true);
    const ack = await emit('answers:submit', { answers });
    setBusy(false);
    if (!ack.ok) show(ack.error ?? 'Could not submit');
  }

  function handleNext() {
    if (currentQ < questions.length - 1) {
      setCurrentQ(currentQ + 1);
    } else {
      void submitAll();
    }
  }

  if (submitted) {
    const players = room?.players.filter((p) => p.connected && p.hasRestaurant) ?? [];
    return (
      <Screen center className="answering">
        <Countdown />
        <WaitingFor
          label="SUBMITTED!"
          done={players.filter((p) => p.hasAnswered).length}
          total={players.length}
          players={players}
          isDone={(p) => p.hasAnswered}
          icon="clock"
        />
        <HostSkip label="Skip to voting ⏭" />
      </Screen>
    );
  }

  return (
    <Screen className="answering">
      <Countdown />
      <div className="question-header">
        <h2 className="phase-title" style={{ margin: 0, textAlign: 'left' }}>
          QUIZZIN&apos; TIME
        </h2>
        <span className="phase-sub" style={{ fontFamily: 'var(--ds-font-header)', fontSize: 'var(--ds-text-xl)' }}>
          Q{currentQ + 1}/{questions.length}
        </span>
      </div>

      <p className="phase-sub">Be funny. You&apos;ll vote on the best answers next.</p>

      {current && (
        <>
          <AnimatePresence mode="wait">
            <Motion.div
              key={current.id}
              className="question-card"
              initial={{ x: 50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -50, opacity: 0 }}
            >
              <p className="question-card__text">{current.text}</p>
            </Motion.div>
          </AnimatePresence>

          <Textarea
            variant="sketch"
            maxLength={280}
            placeholder="Write something funny…"
            value={answers[current.id] ?? ''}
            onChange={(e) => setAnswers((a) => ({ ...a, [current.id]: e.target.value }))}
            autoFocus
          />
        </>
      )}

      <div className="screen__sticky-foot">
        <Button
          variant={currentFilled ? 'success' : 'disabled'}
          size="lg"
          disabled={busy || !currentFilled}
          onClick={handleNext}
        >
          {currentQ === questions.length - 1 ? 'FINISH' : 'NEXT'} <Send size={20} />
        </Button>
        <HostSkip label="Skip to voting ⏭" />
      </div>
    </Screen>
  );
}
