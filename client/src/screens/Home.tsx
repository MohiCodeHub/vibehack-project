import { useEffect, useState } from 'react';
import { useGame } from '../lib/socket.tsx';
import { useToast } from '../components/Toast.tsx';
import { getStoredName, setStoredName, getPlayerId, getLastRoom, setLastRoom } from '../lib/identity.ts';

type Mode = 'home' | 'create' | 'join';

export function Home() {
  const { emit, connected } = useGame();
  const { show } = useToast();
  const [mode, setMode] = useState<Mode>('home');
  const [name, setName] = useState(getStoredName());
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  // Offer to rejoin a previous room on load.
  const [lastRoom] = useState(getLastRoom());

  useEffect(() => {
    document.title = 'Where To?';
  }, []);

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
    <div className="screen home">
      <header className="hero">
        <h1 className="logo">
          Where<span className="logo-to">To?</span>
        </h1>
        <p className="tagline">Let the group decide. The game picks the place.</p>
      </header>

      <div className="card-stack">
        <label className="field">
          <span>Your name</span>
          <input
            className="input"
            value={name}
            maxLength={20}
            placeholder="Tap to type…"
            onChange={(e) => setName(e.target.value)}
            autoCapitalize="words"
          />
        </label>

        {mode === 'home' && (
          <>
            <button className="btn btn-primary big" disabled={busy || !connected} onClick={create}>
              Create Room
            </button>
            <button className="btn btn-secondary big" disabled={busy} onClick={() => setMode('join')}>
              Join Room
            </button>
            {lastRoom && (
              <button className="btn btn-ghost" disabled={busy} onClick={() => join(lastRoom)}>
                Rejoin {lastRoom}
              </button>
            )}
          </>
        )}

        {mode === 'join' && (
          <>
            <label className="field">
              <span>Room code</span>
              <input
                className="input code-input"
                value={code}
                maxLength={4}
                placeholder="ABCD"
                inputMode="text"
                autoCapitalize="characters"
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
              />
            </label>
            <button className="btn btn-primary big" disabled={busy || !connected} onClick={() => join()}>
              Join
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => setMode('home')}>
              Back
            </button>
          </>
        )}
      </div>

      {!connected && <p className="hint">Connecting to server…</p>}
    </div>
  );
}
