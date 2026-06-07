// Solo test-mode simulation: ONE human + bots play the whole game.
// Verifies a single player can run every phase end-to-end.
// Usage: node scripts/simulate-solo.mjs   (server on :3001, USE_MOCKS=true)
import { io } from 'socket.io-client';

const URL = process.env.SIM_URL || 'http://localhost:3001';
const log = (...a) => console.log(...a);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const emit = (s, ev, p) => new Promise((res) => s.emit(ev, p, (a) => res(a)));

const me = { name: 'Solo', id: 'sim_solo_' + Math.random().toString(36).slice(2, 8) };
const socket = io(URL, { transports: ['websocket'] });
let room = null,
  priv = null;
socket.on('room:update', (r) => (room = r));
socket.on('private:update', (p) => (priv = p));

const until = async (cond, label, timeout = 6000) => {
  const t = Date.now();
  while (Date.now() - t < timeout) {
    if (cond()) return;
    await wait(50);
  }
  throw new Error('Timeout: ' + label);
};

async function run() {
  await until(() => socket.connected, 'connect');
  log('✓ connected as the only human:', me.name);

  const created = await emit(socket, 'room:create', { outingType: 'Dinner', playerName: me.name, playerId: me.id });
  const code = created.data.code;
  log(`✓ created room ${code}`);

  // Add two bots
  await emit(socket, 'room:addBot');
  await emit(socket, 'room:addBot');
  await until(() => room?.players.filter((p) => p.isBot).length === 2, 'two bots added');
  log(`✓ added bots: ${room.players.filter((p) => p.isBot).map((b) => b.name).join(', ')} (total ${room.players.length})`);

  // Start — should be allowed with 1 human + 2 bots
  const started = await emit(socket, 'room:start');
  if (!started.ok) throw new Error('start failed: ' + started.error);
  await until(() => room.phase === 'selecting', 'selecting');
  await until(() => room.players.filter((p) => p.isBot && p.hasRestaurant).length === 2, 'bots locked');
  log('✓ started → selecting; bots auto-locked their restaurants');

  // Human locks a pick → should auto-advance to answering. The bots may have
  // randomly grabbed our first choice (duplicates are rejected), so try a few terms.
  let myPick = null;
  for (const term of ['Pho', 'Ramen', 'Nonna', 'Saffron', 'Dragon', 'Burger', 'Green', 'Smoke']) {
    const search = await emit(socket, 'restaurant:search', { name: term });
    const lk = await emit(socket, 'restaurant:lock', { restaurant: search.data.restaurant });
    if (lk.ok) { myPick = search.data.restaurant.name; break; }
  }
  if (!myPick) throw new Error('could not lock any restaurant (all taken?)');
  await until(() => room.phase === 'answering', 'answering', 8000);
  await until(() => (priv?.questions?.length ?? 0) === 3, 'my questions');
  await until(() => room.players.filter((p) => p.isBot && p.hasAnswered).length === 2, 'bots answered');
  log(`✓ I championed "${myPick}" → answering; bots auto-answered`);

  // Human answers → auto-advance to voting
  const answers = {};
  priv.questions.forEach((q, i) => (answers[q.id] = `Solo answer ${i + 1}`));
  await emit(socket, 'answers:submit', { answers });
  await until(() => room.phase === 'voting', 'voting r1', 6000);
  log('✓ I answered → voting round 1 (bots already voted, waiting on me)');

  // Play all 3 voting rounds
  for (let r = 0; r < 3; r++) {
    await until(() => room.phase === 'voting' && room.round === r, `voting round ${r + 1}`);
    await until(() => room.players.filter((p) => p.isBot && p.hasVoted).length === 2, `bots voted r${r + 1}`);
    const cards = (room.voteCards ?? []).filter((c) => c.authorId !== me.id);
    const ranked = cards.slice(0, 3).map((c) => c.authorId);
    const v = await emit(socket, 'vote:submit', { ranked });
    if (!v.ok) throw new Error('vote failed: ' + v.error);
    await until(() => room.phase === 'leaderboard', `leaderboard r${r + 1}`, 6000);
    const board = [...room.players].sort((a, b) => b.score - a.score);
    log(`✓ round ${r + 1} → ${board.map((b) => `${b.name}:${b.score}`).join('  ')}`);
    await emit(socket, 'round:next');
  }

  await until(() => room.phase === 'final', 'final', 6000);
  log(`\n🏆 WHERE YOU'RE GOING: ${room.winner.restaurant.name} (championed by ${room.winner.playerName})`);
  log('\n✅ SOLO FLOW PASSED — one human + bots completed the whole game');
  socket.close();
  process.exit(0);
}
run().catch((e) => {
  console.error('\n❌ SOLO SIM FAILED:', e.message);
  process.exit(1);
});
