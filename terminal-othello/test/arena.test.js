import test from 'node:test';
import assert from 'node:assert/strict';
import { Arena, RECONNECT_MS, IDLE_MS, MAX_PLAYERS } from '../arena.js';
import { legalMoves } from '../rules.js';

function setup() {
  const a = new Arena(undefined, 1000, () => 0);
  const live = new Set(['alice', 'bob']);
  for (const id of live) a.connect(id);
  return { a, live, send: (id, m) => a.command(id, m, live) };
}

test('waiting, randomized match, identity privacy, turn/revision validation and reconnect', () => {
  const { a, live, send } = setup();
  send('alice', { type: 'join' }); assert.equal(a.snapshot('alice', live).status, 'waiting');
  send('bob', { type: 'join' });
  let s = a.snapshot('bob', live);
  assert.equal(s.color, 1); assert.equal(s.game.board.filter(Boolean).length, 4);
  assert.ok(!JSON.stringify(s).includes('alice'));
  const move = { type: 'move', game: s.game.id, revision: 0, cell: 19 };
  assert.throws(() => send('alice', move));
  send('bob', move); assert.throws(() => send('bob', move));
  live.delete('bob'); a.disconnect('bob');
  const revived = new Arena(JSON.parse(JSON.stringify(a.data)), a.now + 1000);
  revived.connect('bob'); live.add('bob');
  assert.equal(revived.snapshot('bob', live).game.revision, 1);
  assert.equal(revived.snapshot('alice', live).opponentOnline, true);
});

test('cancel before/after matching cannot leave an active orphan game', () => {
  for (const cancelFirst of [true, false]) {
    const { a, live, send } = setup();
    send('alice', { type: 'join' });
    if (cancelFirst) send('alice', { type: 'cancel' });
    send('bob', { type: 'join' });
    if (!cancelFirst) send('alice', { type: 'cancel' });
    assert.equal(a.snapshot('alice', live).status, 'idle');
    assert.equal(a.snapshot('bob', live).status, cancelFirst ? 'waiting' : 'finished');
    assert.equal(Object.values(a.data.games).filter(g => !g.ended).length, 0);
    send('alice', { type: 'cancel' });
  }
});

test('offline waiting players excluded, queue persisted, grace expiry and cleanup', () => {
  const { a, live, send } = setup();
  send('alice', { type: 'join' }); a.disconnect('alice'); live.delete('alice');
  send('bob', { type: 'join' }); assert.equal(a.snapshot('bob', live).status, 'waiting');
  const revived = new Arena(JSON.parse(JSON.stringify(a.data)), a.now + 500);
  revived.connect('alice'); live.add('alice'); revived.match('alice', live);
  assert.equal(revived.snapshot('alice', live).status, 'playing');
  revived.disconnect('bob'); live.delete('bob'); revived.now += RECONNECT_MS;
  revived.sweep();
  assert.equal(revived.snapshot('alice', live).game.reason, 'disconnected');
  assert.equal(revived.snapshot('alice', live).game.winner, revived.snapshot('alice', live).color);
  revived.now += IDLE_MS; revived.sweep();
  assert.deepEqual(revived.data, { players: {}, games: {} }); assert.equal(revived.deadline(), null);
});

test('simultaneous joins pair each player exactly once, bounded admission', () => {
  const a = new Arena(undefined, 1000), live = new Set();
  for (let i = 0; i < MAX_PLAYERS; i++) { const id = String(i); a.connect(id); live.add(id); a.command(id, { type: 'join' }, live); }
  assert.equal(Object.values(a.data.games).length, MAX_PLAYERS / 2);
  assert.equal(new Set(Object.values(a.data.games).flatMap(g => g.players)).size, MAX_PLAYERS);
  assert.throws(() => a.connect('overflow'));
});

test('authoritative full game, pass, draw and inactivity timeout', () => {
  const { a, live, send } = setup();
  send('alice', { type: 'join' }); send('bob', { type: 'join' });
  const g = Object.values(a.data.games)[0];
  let passes = 0;
  while (!g.ended) {
    send(g.players[g.turn - 1], { type: 'move', game: g.id, revision: g.revision, cell: legalMoves(g.board, g.turn)[0] });
    if (g.passed && !g.ended) passes++;
  }
  assert.ok(passes); assert.equal(g.reason, 'scored');
  assert.equal(a.snapshot('alice', live).status, 'finished');
  send('alice', { type: 'join' }); send('bob', { type: 'join' });
  const next = Object.values(a.data.games).find(x => !x.ended);
  // Final move at h4 flips g4: 30 B / 33 W becomes 32 / 32.
  next.board = Array(64).fill(2); next.board.fill(1, 0, 30); next.board[31] = 0;
  next.turn = 1;
  send(next.players[0], { type: 'move', game: next.id, revision: next.revision, cell: 31 });
  assert.equal(next.reason, 'scored'); assert.equal(next.winner, 0);
  send('alice', { type: 'join' }); send('bob', { type: 'join' });
  const idle = Object.values(a.data.games).find(x => !x.ended);
  a.now += IDLE_MS; a.sweep(); assert.equal(idle.reason, 'inactive'); assert.equal(idle.winner, 0);
});
