import { useGame, useMe } from '../lib/socket.tsx';
import { useToast } from '../components/Toast.tsx';
import { clearLastRoom } from '../lib/identity.ts';
import { PlayerRow } from '../components/PlayerRow.tsx';

export function Lobby() {
  const { room, emit, setRoom } = useGame();
  const me = useMe();
  const { show } = useToast();
  if (!room) return null;

  const isHost = me?.isHost;
  const connectedCount = room.players.filter((p) => p.connected).length;
  const botCount = room.players.filter((p) => p.isBot).length;
  const isFull = room.players.length >= 6;

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
    // soft leave — socket stays connected; server marks disconnect on real drop.
    window.location.reload();
  }

  return (
    <div className="screen lobby">
      <div className="code-banner">
        <span className="code-label">Join code</span>
        <span className="code-big">{room.code}</span>
        <span className="code-hint">Others tap “Join Room” and enter this</span>
      </div>

      <div className="section-head">
        <h2>Players</h2>
        <span className="pill">{connectedCount} in</span>
      </div>

      <ul className="player-list">
        {room.players.map((p) => (
          <PlayerRow key={p.id} p={p} youId={me?.id} />
        ))}
        {Array.from({ length: Math.max(0, 2 - room.players.length) }).map((_, i) => (
          <li key={`ghost-${i}`} className="player-row ghost">
            <span className="avatar">?</span>
            <span className="player-name">Waiting for players…</span>
          </li>
        ))}
      </ul>

      <div className="lobby-actions">
        {isHost ? (
          <>
            <button className="btn btn-primary big" disabled={connectedCount < 2} onClick={start}>
              {connectedCount < 2 ? 'Need 2+ players' : `Start (${connectedCount})`}
            </button>
            <div className="bot-controls">
              <button className="btn btn-secondary" disabled={isFull} onClick={addBot}>
                + Add test bot
              </button>
              {botCount > 0 && (
                <button className="btn btn-ghost" onClick={removeBot}>
                  − Remove bot
                </button>
              )}
            </div>
            <p className="hint">Solo testing? Add a bot or two — they auto-play so you can run the whole game alone.</p>
          </>
        ) : (
          <p className="hint pulse">Waiting for host to start…</p>
        )}
        <button className="btn btn-ghost" onClick={leave}>
          Leave
        </button>
      </div>
    </div>
  );
}
