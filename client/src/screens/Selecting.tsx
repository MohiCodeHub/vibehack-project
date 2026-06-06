import { useEffect, useState } from 'react';
import type { Restaurant, SwipeCard, SwipeChoice } from '@shared/types.ts';
import { useGame, useMe } from '../lib/socket.tsx';
import { useToast } from '../components/Toast.tsx';
import { getLocation, type LatLng } from '../lib/geo.ts';
import { SwipeDeck } from '../components/SwipeDeck.tsx';
import { RestaurantCard } from '../components/RestaurantCard.tsx';
import { WaitingFor } from '../components/WaitingFor.tsx';
import { Countdown } from '../components/Countdown.tsx';
import { HostSkip } from '../components/HostSkip.tsx';

type Path = 'choose' | 'manual' | 'swipe' | 'pick';

export function Selecting() {
  const { room, emit, priv } = useGame();
  const me = useMe();
  const { show } = useToast();

  const [path, setPath] = useState<Path>('choose');
  const [loc, setLoc] = useState<LatLng | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<Restaurant[]>([]);
  const [cards, setCards] = useState<SwipeCard[]>([]);

  // Grab location once (non-blocking; falls back to default city server-side).
  useEffect(() => {
    getLocation().then(setLoc);
  }, []);

  const locked = !!priv?.restaurant;

  async function lock(r: Restaurant) {
    setBusy(true);
    const ack = await emit('restaurant:lock', { restaurant: r });
    setBusy(false);
    if (!ack.ok) show(ack.error ?? 'Could not lock');
  }

  async function startSwipe() {
    setBusy(true);
    const ack = await emit<{ cards: SwipeCard[] }>('swipe:cards');
    setBusy(false);
    if (!ack.ok || !ack.data) return show('Could not load cards');
    setCards(ack.data.cards);
    setPath('swipe');
  }

  async function onSwipeDone(choices: SwipeChoice[]) {
    setBusy(true);
    const ack = await emit<{ candidates: Restaurant[] }>('swipe:candidates', { choices, loc });
    setBusy(false);
    if (!ack.ok || !ack.data) return show('Could not find matches');
    setCandidates(ack.data.candidates);
    setPath('pick');
  }

  async function searchManual() {
    if (!query.trim()) return show('Type a restaurant name');
    setBusy(true);
    const ack = await emit<{ restaurant: Restaurant }>('restaurant:search', { name: query.trim(), loc });
    setBusy(false);
    if (!ack.ok || !ack.data) return show('Could not find that');
    await lock(ack.data.restaurant);
  }

  if (locked) {
    const others = room?.players.filter((p) => p.connected) ?? [];
    return (
      <div className="screen selecting">
        <Countdown />
        <h2 className="phase-title">Locked in! 🔒</h2>
        <RestaurantCard r={priv!.restaurant!} championed />
        <WaitingFor
          label="Waiting for everyone to pick…"
          done={others.filter((p) => p.hasRestaurant).length}
          total={others.length}
          players={others}
          isDone={(p) => p.hasRestaurant}
        />
        <HostSkip label="Skip to questions ⏭" />
      </div>
    );
  }

  return (
    <div className="screen selecting">
      <Countdown />
      <h2 className="phase-title">Champion a restaurant</h2>

      {path === 'choose' && (
        <div className="card-stack">
          <button className="btn btn-primary big" disabled={busy} onClick={() => setPath('manual')}>
            🍴 I have a pick
          </button>
          <button className="btn btn-secondary big" disabled={busy} onClick={startSwipe}>
            🤔 Help me decide
          </button>
          <p className="hint">{loc ? 'Using your location' : 'Using default city'}</p>
        </div>
      )}

      {path === 'manual' && (
        <div className="card-stack">
          <label className="field">
            <span>Restaurant name</span>
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Nonna’s Trattoria"
              autoFocus
            />
          </label>
          <button className="btn btn-primary big" disabled={busy} onClick={searchManual}>
            {busy ? 'Finding…' : 'Lock it in'}
          </button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => setPath('choose')}>
            Back
          </button>
        </div>
      )}

      {path === 'swipe' && <SwipeDeck cards={cards} onDone={onSwipeDone} />}

      {path === 'pick' && (
        <div className="card-stack">
          <p className="hint">Your matches — tap one to champion it:</p>
          {candidates.map((r) => (
            <button key={r.id} className="reveal-tap" disabled={busy} onClick={() => lock(r)}>
              <RestaurantCard r={r} />
            </button>
          ))}
          <button className="btn btn-ghost" disabled={busy} onClick={() => setPath('choose')}>
            Start over
          </button>
        </div>
      )}

      <HostSkip label="Skip to questions ⏭" />
    </div>
  );
}
