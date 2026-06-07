import { useEffect, useState } from 'react';
import type { Restaurant, SwipeCard, SwipeChoice } from '@shared/types.ts';
import { useGame } from '../lib/socket.tsx';
import { useToast } from '../components/Toast.tsx';
import { getLocation, type LatLng } from '../lib/geo.ts';
import { SwipeDeck } from '../components/SwipeDeck.tsx';
import { RestaurantCard } from '../components/RestaurantCard.tsx';
import { WaitingFor } from '../components/WaitingFor.tsx';
import { Screen } from '../components/layout/Screen.tsx';
import { Button, SegmentedControl } from '../components/ui';
import { PlacesAutocomplete, type PlaceSuggestion } from '../components/PlacesAutocomplete.tsx';
import { Countdown } from '../components/Countdown.tsx';

type Path = 'choose' | 'manual' | 'swipe' | 'pick';

function pickFieldLabel(decisionTopic?: string): string {
  const topic = decisionTopic?.trim();
  return topic || 'Your pick';
}

export function Selecting() {
  const { room, emit, priv } = useGame();
  const { show } = useToast();

  const [path, setPath] = useState<Path>('choose');
  const [loc, setLoc] = useState<LatLng | null>(null);
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

  async function searchByPlaceId(suggestion: PlaceSuggestion) {
    setBusy(true);
    const ack = await emit<{ restaurant: Restaurant }>('restaurant:search', { placeId: suggestion.placeId });
    setBusy(false);
    if (!ack.ok || !ack.data) return show(ack.error ?? 'Could not find that place');
    await lock(ack.data.restaurant);
  }

  const segmentValue = path === 'manual' ? 'search' : path === 'swipe' || path === 'pick' ? 'help' : null;

  if (locked) {
    const others = room?.players.filter((p) => p.connected) ?? [];
    return (
      <Screen center className="selecting">
        <Countdown />
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
      <Countdown />
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
          <PlacesAutocomplete
            emit={emit}
            loc={loc}
            disabled={busy}
            onSelect={searchByPlaceId}
            placeholder={
              room?.decisionTopic?.trim()
                ? `Search or type your ${pickFieldLabel(room.decisionTopic).toLowerCase()}…`
                : 'Search restaurants…'
            }
          />
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
