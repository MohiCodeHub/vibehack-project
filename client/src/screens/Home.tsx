import { useEffect, useState } from 'react';
import { Play, Users } from 'lucide-react';
import { motion as Motion } from 'motion/react';
import { useGame } from '../lib/socket.tsx';
import { useToast } from '../components/Toast.tsx';
import { getStoredName, setStoredName, getPlayerId, getLastRoom, setLastRoom } from '../lib/identity.ts';
import { Screen } from '../components/layout/Screen.tsx';
import { Logo } from '../components/layout/Logo.tsx';
import { CrewMascot } from '../components/illustrations/Mascots.tsx';
import { Button, Card, FormField, Input } from '../components/ui';

type Mode = 'initial' | 'create' | 'join';

export function Home() {
  const { emit, connected } = useGame();
  const { show } = useToast();
  const [mode, setMode] = useState<Mode>('initial');
  const [name, setName] = useState(getStoredName());
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastRoom] = useState(getLastRoom());
  const [slowWake, setSlowWake] = useState(false);

  useEffect(() => {
    document.title = 'Where To?';
  }, []);

  useEffect(() => {
    if (connected) return setSlowWake(false);
    const t = window.setTimeout(() => setSlowWake(true), 4000);
    return () => window.clearTimeout(t);
  }, [connected]);

  async function create() {
    if (!name.trim()) return show('Enter a name first');
    setBusy(true);
    setStoredName(name.trim());
    const ack = await emit('room:create', {
      outingType: 'Dinner',
      playerName: name.trim(),
      playerId: getPlayerId(),
    });
    setBusy(false);
    if (!ack.ok) return show(ack.error ?? 'Could not create room');
    const data = ack.data as { code: string };
    setLastRoom(data.code);
  }

  async function join(targetCode?: string) {
    const c = (targetCode ?? code).trim().toUpperCase();
    if (!name.trim()) return show('Enter a name first');
    if (c.length !== 4) return show('Codes are 4 letters');
    setBusy(true);
    setStoredName(name.trim());
    const ack = await emit('room:join', {
      code: c,
      playerName: name.trim(),
      playerId: getPlayerId(),
    });
    setBusy(false);
    if (!ack.ok) return show(ack.error ?? 'Could not join');
    setLastRoom(c);
  }

  return (
    <Screen className="home">
      {mode === 'initial' && (
        <div className="hero-center">
          <Logo animate />
          <div className="hero-art">
            <CrewMascot />
          </div>
          <div className="screen__actions">
            <Button variant="secondary" size="lg" disabled={busy} onClick={() => setMode('create')}>
              <Play fill="currentColor" size={24} /> CREATE GAME
            </Button>
            <Button variant="accent" size="lg" disabled={busy} onClick={() => setMode('join')}>
              <Users size={24} /> JOIN GAME
            </Button>
            {lastRoom && (
              <Button variant="ghost" disabled={busy || !connected} onClick={() => join(lastRoom)}>
                Rejoin {lastRoom}
              </Button>
            )}
          </div>
        </div>
      )}

      {mode !== 'initial' && <Logo muted />}

      {(mode === 'create' || mode === 'join') && (
        <Motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <Card variant="default" padding="lg">
            <FormField label="Your Name" htmlFor="home-name" required>
              <Input
                id="home-name"
                value={name}
                maxLength={20}
                placeholder="e.g. PizzaLover69"
                onChange={(e) => setName(e.target.value)}
                autoCapitalize="words"
                autoFocus
              />
            </FormField>

            {mode === 'join' && (
              <FormField label="Room Code" htmlFor="home-code" required>
                <Input
                  id="home-code"
                  variant="code"
                  value={code}
                  maxLength={4}
                  placeholder="ABCD"
                  inputMode="text"
                  autoCapitalize="characters"
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                />
              </FormField>
            )}

            <div className="screen__actions" style={{ marginTop: 'var(--ds-space-4)' }}>
              <Button
                variant="primary"
                size="lg"
                disabled={busy || !connected}
                onClick={mode === 'create' ? create : () => join()}
              >
                {mode === 'create' ? "LET'S GO!" : 'JOIN IN!'}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setMode('initial')}>
                Back
              </Button>
            </div>
          </Card>
        </Motion.div>
      )}

      {!connected && (
        <p className="hint hint--pulse">
          {slowWake ? 'Waking the server up — free hosting can take ~30s on first load…' : 'Connecting to server…'}
        </p>
      )}
    </Screen>
  );
}
