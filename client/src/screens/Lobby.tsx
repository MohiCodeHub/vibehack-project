import { useEffect, useRef, useState } from 'react';
import { User } from 'lucide-react';
import { useGame, useMe } from '../lib/socket.tsx';
import { useToast } from '../components/Toast.tsx';
import { clearLastRoom } from '../lib/identity.ts';
import { PlayerTile, PlayerTileGhost } from '../components/PlayerRow.tsx';
import { Screen } from '../components/layout/Screen.tsx';
import { RoomCodeBanner } from '../components/layout/RoomCodeBanner.tsx';
import { DecisionTopicDisplay } from '../components/layout/DecisionTopicDisplay.tsx';
import { Button, Card, Badge, FormField, Input } from '../components/ui';

export function Lobby() {
  const { room, emit, setRoom } = useGame();
  const me = useMe();
  const { show } = useToast();
  const [topicDraft, setTopicDraft] = useState('');
  const savingTopic = useRef(false);

  useEffect(() => {
    setTopicDraft(room?.decisionTopic ?? '');
  }, [room?.decisionTopic]);

  if (!room) return null;

  const isHost = me?.isHost;
  const connectedCount = room.players.filter((p) => p.connected).length;
  const botCount = room.players.filter((p) => p.isBot).length;
  const isFull = room.players.length >= 6;

  async function saveTopic() {
    if (!room) return;
    const trimmed = topicDraft.trim();
    if (trimmed === (room.decisionTopic ?? '')) return;
    if (savingTopic.current) return;
    savingTopic.current = true;
    const ack = await emit('room:setTopic', { topic: trimmed });
    savingTopic.current = false;
    if (!ack.ok) show(ack.error ?? 'Could not save topic');
  }

  async function start() {
    const ack = await emit('room:start');
    if (!ack.ok) show(ack.error ?? 'Could not start');
  }

  async function addBot() {
    const ack = await emit('room:addBot');
    if (!ack.ok) show(ack.error ?? 'Could not add bot');
  }

  async function removeBot() {
    const ack = await emit('room:removeBot');
    if (!ack.ok) show(ack.error ?? 'Could not remove bot');
  }

  function leave() {
    clearLastRoom();
    setRoom(null);
    window.location.reload();
  }

  return (
    <Screen className="lobby">
      {isHost && (
        <FormField
          label="What are you undecided about?"
          htmlFor="lobby-topic"
          hint="Optional — everyone in the room will see this"
        >
          <select
            className="ui-input lobby-topic-preset"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) setTopicDraft(e.target.value);
            }}
          >
            <option value="" disabled>— pick a template —</option>
            <option value="Restaurant / dinner">Restaurant / dinner</option>
            <option value="Bar or drinks">Bar or drinks</option>
            <option value="Movie to watch">Movie to watch</option>
            <option value="TV show to binge">TV show to binge</option>
            <option value="Weekend activity">Weekend activity</option>
            <option value="Date night">Date night</option>
            <option value="Holiday destination">Holiday destination</option>
            <option value="Something else">Something else</option>
          </select>
          <Input
            id="lobby-topic"
            value={topicDraft}
            maxLength={100}
            placeholder="Or type your own…"
            onChange={(e) => setTopicDraft(e.target.value)}
            onBlur={() => void saveTopic()}
            style={{ marginTop: 'var(--ds-space-2)' }}
          />
        </FormField>
      )}

      {room.decisionTopic && <DecisionTopicDisplay topic={room.decisionTopic} />}

      <RoomCodeBanner code={room.code} hint="Others tap Join Game and enter this code" />

      <Card variant="muted" padding="lg" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-4)' }}>
        <h3 className="phase-title" style={{ fontSize: 'var(--ds-text-2xl)', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 'var(--ds-space-2)' }}>
          <User size={24} /> PLAYERS <Badge variant="secondary">{connectedCount} in</Badge>
        </h3>
        <ul className="player-grid">
          {room.players.map((p, i) => (
            <PlayerTile key={p.id} p={p} youId={me?.id} index={i} />
          ))}
          {Array.from({ length: Math.max(0, 4 - room.players.length) }).map((_, i) => (
            <PlayerTileGhost key={`ghost-${i}`} />
          ))}
        </ul>
      </Card>

      <div className="screen__actions">
        {isHost ? (
          <>
            <Button
              variant={connectedCount < 2 ? 'disabled' : 'success'}
              size="lg"
              disabled={connectedCount < 2}
              onClick={start}
            >
              {connectedCount < 2 ? 'NEED 2+ PLAYERS' : `START GAME (${connectedCount})`}
            </Button>
            <div className="bot-controls">
              <Button variant="secondary" size="sm" block disabled={isFull} onClick={addBot}>
                + Add test bot
              </Button>
              {botCount > 0 && (
                <Button variant="ghost" size="sm" block onClick={removeBot}>
                  − Remove bot
                </Button>
              )}
            </div>
            <p className="hint">Solo testing? Add a bot or two — they auto-play the whole game with you.</p>
          </>
        ) : (
          <div className="host-wait-banner">Waiting for host to start…</div>
        )}
        <Button variant="ghost" onClick={leave}>
          Leave
        </Button>
      </div>
    </Screen>
  );
}
