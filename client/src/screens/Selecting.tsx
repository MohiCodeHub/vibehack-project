import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import type { Restaurant, SwipeCard, SwipeChoice } from '@shared/types.ts';
import { useGame } from '../lib/socket.tsx';
import { useToast } from '../components/Toast.tsx';
import { getLocation, type LatLng } from '../lib/geo.ts';
import { SwipeDeck } from '../components/SwipeDeck.tsx';
import { RestaurantCard } from '../components/RestaurantCard.tsx';
import { WaitingFor } from '../components/WaitingFor.tsx';
import { Screen } from '../components/layout/Screen.tsx';
import { Button, FormField, Input, SegmentedControl } from '../components/ui';

type Path = 'choose' | 'manual' | 'swipe' | 'pick';

export function Selecting() {
  const { room, emit, priv } = useGame();
  const { show } = useToast();

  const [path, setPath] = useState<Path>('choose');
  const [loc, setLoc] = useState<LatLng | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<Restaurant[]>([]);
  const [cards, setCards] = useState<SwipeCard[]>([]);

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

  const segmentValue = path === 'manual' ? 'search' : path === 'swipe' || path === 'pick' ? 'help' : null;

  if (locked) {
    const others = room?.players.filter((p) => p.connected) ?? [];
    return (
      <Screen center className="selecting">
        <WaitingFor
          label="LOCKED IN!"
          done={others.filter((p) => p.hasRestaurant).length}
          total={others.length}
          players={others}
          isDone={(p) => p.hasRestaurant}
        />
        <RestaurantCard r={priv!.restaurant!} championed />
      </Screen>
    );
  }

  return (
    <Screen className="selecting">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 'var(--ds-space-4)' }}>
        <h2 className="phase-title" style={{ textAlign: 'left', margin: 0 }}>
          PICK YOUR PICK
        </h2>
        {path !== 'choose' && (
          <SegmentedControl
            aria-label="Selection mode"
            value={segmentValue ?? 'search'}
            onChange={(v) => {
              if (v === 'search') setPath('manual');
              else startSwipe();
            }}
            options={[
              { value: 'search', label: 'SEARCH' },
              { value: 'help', label: 'HELP ME' },
            ]}
          />
        )}
      </div>

      {path === 'choose' && (
        <div className="screen__actions">
          <Button variant="primary" size="lg" disabled={busy} onClick={() => setPath('manual')}>
            🍴 I have a pick
          </Button>
          <Button variant="secondary" size="lg" disabled={busy} onClick={startSwipe}>
            🤔 Help me decide
          </Button>
          <p className="hint">{loc ? 'Using your location' : 'Using default city'}</p>
        </div>
      )}

      {path === 'manual' && (
        <div className="screen__actions">
          <FormField label="Restaurant name">
            <Input
              variant="search"
              icon={<Search />}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search restaurants…"
              autoFocus
            />
          </FormField>
          <Button variant="success" size="lg" disabled={busy} onClick={searchManual}>
            {busy ? 'Finding…' : 'Lock it in'}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setPath('choose')}>
            Back
          </Button>
        </div>
      )}

      {path === 'swipe' && <SwipeDeck cards={cards} onDone={onSwipeDone} />}

      {path === 'pick' && (
        <div className="screen__actions">
          <p className="phase-sub">Based on your vibes — tap one to champion:</p>
          {candidates.map((r) => (
            <button key={r.id} type="button" className="resto-pick-btn" disabled={busy} onClick={() => lock(r)}>
              <RestaurantCard r={r} highlight compact />
            </button>
          ))}
          <Button variant="ghost" disabled={busy} onClick={() => setPath('choose')}>
            Start over
          </Button>
        </div>
      )}
    </Screen>
  );
}
