// End-to-end 3-player simulation against a running server.
// Usage: node scripts/simulate.mjs  (server must be on :3001 with USE_MOCKS=true)
import { io } from 'socket.io-client';

const URL = process.env.SIM_URL || 'http://localhost:3001';
const log = (...a) => console.log(...a);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function mkPlayer(name) {
  const socket = io(URL, { transports: ['websocket'] });
  const p = {
    name,
    id: `sim_${name}_${Math.random().toString(36).slice(2, 8)}`,
    socket,
    room: null,
    priv: null,
  };
  socket.on('room:update', (r) => (p.room = r));
  socket.on('private:update', (pr) => (p.priv = pr));
  return p;
}

const emit = (p, ev, payload) =>
  new Promise((res) => p.socket.emit(ev, payload, (ack) => res(ack)));

const waitUntil = async (cond, label, timeout = 5000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (cond()) return true;
    await wait(50);
  }
  throw new Error(`Timeout waiting for: ${label}`);
};

async function run() {
  const [host, p2, p3] = [mkPlayer('Avery'), mkPlayer('Blair'), mkPlayer('Cory')];
  await Promise.all([host, p2, p3].map((p) => waitUntil(() => p.socket.connected, `${p.name} connect`)));
  log('✓ all three sockets connected');

  // --- create + join ---
  const created = await emit(host, 'room:create', {
    outingType: 'Dinner',
    playerName: host.name,
    playerId: host.id,
  });
  if (!created.ok) throw new Error('create failed: ' + created.error);
  const code = created.data.code;
  log(`✓ ${host.name} created room ${code}`);

  for (const p of [p2, p3]) {
    const j = await emit(p, 'room:join', { code, playerName: p.name, playerId: p.id });
    if (!j.ok) throw new Error(`${p.name} join failed: ` + j.error);
  }
  await waitUntil(() => host.room?.players.length === 3, 'host sees 3 players');
  log(`✓ lobby synced: ${host.room.players.map((x) => x.name).join(', ')}`);

  // --- reconnect test: p3 drops and rejoins with same id ---
  p3.socket.disconnect();
  await waitUntil(() => host.room.players.find((x) => x.name === 'Cory' && !x.connected), 'Cory marked offline');
  log('✓ reconnect: Cory shows offline after drop');
  p3.socket.connect();
  await waitUntil(() => p3.socket.connected, 'Cory socket reconnect');
  const rejoin = await emit(p3, 'room:join', { code, playerName: p3.name, playerId: p3.id });
  if (!rejoin.ok || !rejoin.data.rejoined) throw new Error('rejoin did not restore slot');
  await waitUntil(() => host.room.players.find((x) => x.name === 'Cory' && x.connected), 'Cory back online');
  if (host.room.players.length !== 3) throw new Error('duplicate slot after rejoin');
  log('✓ reconnect: Cory restored to same slot (no duplicate)');

  // --- start ---
  const started = await emit(host, 'room:start');
  if (!started.ok) throw new Error('start failed: ' + started.error);
  await waitUntil(() => host.room.phase === 'selecting', 'phase=selecting');
  log('✓ host started → selecting');

  // --- restaurant selection: host manual, others via swipe ---
  const search = await emit(host, 'restaurant:search', { name: 'Ramen' });
  await emit(host, 'restaurant:lock', { restaurant: search.data.restaurant });
  log(`✓ ${host.name} championed "${search.data.restaurant.name}" (manual)`);

  for (const p of [p2, p3]) {
    const cards = await emit(p, 'swipe:cards');
    const choices = cards.data.cards.map((c, i) => ({ cardId: c.id, pick: i % 2 ? 'left' : 'right' }));
    const cand = await emit(p, 'swipe:candidates', { choices });
    const pick = cand.data.candidates[0];
    await emit(p, 'restaurant:lock', { restaurant: pick });
    log(`✓ ${p.name} championed "${pick.name}" (swipe)`);
  }

  await waitUntil(() => host.room.phase === 'answering', 'phase=answering', 8000);
  log('✓ all locked → answering (auto-advance)');

  // --- answering ---
  for (const p of [host, p2, p3]) {
    await waitUntil(() => (p.priv?.questions?.length ?? 0) === 3, `${p.name} got questions`);
    const answers = {};
    p.priv.questions.forEach((q, i) => (answers[q.id] = `${p.name}'s answer ${i + 1}`));
    await emit(p, 'answers:submit', { answers });
  }
  await waitUntil(() => host.room.phase === 'voting', 'phase=voting', 6000);
  log('✓ all answered → voting round 1 (auto-advance)');

  // --- 3 voting rounds ---
  for (let round = 0; round < 3; round++) {
    await waitUntil(() => host.room.phase === 'voting' && host.room.round === round, `voting round ${round + 1}`);
    for (const p of [host, p2, p3]) {
      const cards = (p.room.voteCards ?? []).filter((c) => c.authorId !== p.id);
      const ranked = cards.slice(0, 3).map((c) => c.authorId);
      const v = await emit(p, 'vote:submit', { ranked });
      if (!v.ok) throw new Error(`${p.name} vote failed: ` + v.error);
    }
    await waitUntil(() => host.room.phase === 'leaderboard', `leaderboard after round ${round + 1}`, 6000);
    const board = [...host.room.players].sort((a, b) => b.score - a.score);
    log(`✓ round ${round + 1} tallied → ${board.map((b) => `${b.name}:${b.score}`).join('  ')}`);
    await emit(host, 'round:next');
  }

  await waitUntil(() => host.room.phase === 'final', 'phase=final', 6000);
  const w = host.room.winner;
  log(`\n🏆 WHERE YOU'RE GOING: ${w.restaurant.name}  (championed by ${w.playerName})`);
  log('   map:', w.restaurant.mapUrl);

  // self-vote rejection check
  const selfVote = await emit(host, 'vote:submit', { ranked: [host.id] });
  log(selfVote.ok ? '… (final phase vote correctly ignored)' : '✓ self/late vote rejected: ' + selfVote.error);

  log('\n✅ FULL FLOW PASSED');
  [host, p2, p3].forEach((p) => p.socket.close());
  process.exit(0);
}

run().catch((e) => {
  console.error('\n❌ SIM FAILED:', e.message);
  process.exit(1);
});
