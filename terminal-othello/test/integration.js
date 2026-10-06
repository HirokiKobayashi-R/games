import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

// Without a URL, exercise a real workerd runtime and persistence across restarts.
let server, serverOutput = '';
const scratch = process.argv[2] ? null : await mkdtemp(join(tmpdir(), 'othello-test-'));
const probe = createServer();
if (scratch) await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = scratch ? probe.address().port : null;
if (scratch) await new Promise(resolve => probe.close(resolve));
const endpoint = process.argv[2] || `http://127.0.0.1:${port}`;
async function startServer() {
  serverOutput = '';
  server = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--ip', '127.0.0.1',
    '--port', String(port), '--inspector-port', '0', '--persist-to', scratch], {
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(scratch, 'logs') },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.on('data', data => { serverOutput += data; });
  server.stderr.on('data', data => { serverOutput += data; });
  for (let i = 0; i < 150; i++) {
    if (server.exitCode != null) throw new Error(`Local server exited: ${serverOutput}`);
    try { if ((await fetch(new URL('/health', endpoint))).ok) return; } catch {}
    await sleep(100);
  }
  throw new Error(`Local server did not start: ${serverOutput}`);
}
async function stopServer() {
  if (!server || server.exitCode != null) return;
  const done = new Promise(resolve => server.once('exit', resolve));
  server.kill('SIGTERM'); await done;
}
if (scratch) await startServer();
const url = new URL('/connect', endpoint); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
assert.equal((await (await fetch(new URL('/health', endpoint))).json()).protocol, 1);
const peers = [];
async function peer(token = randomBytes(32).toString('hex')) {
  const socket = new WebSocket(url, ['othello', `s.${token}`]);
  const p = { socket, token, state: null, errors: [], pong: false };
  peers.push(p);
  socket.addEventListener('message', ({ data }) => {
    if (data === 'pong') { p.pong = true; return; }
    const m = JSON.parse(data);
    if (m.type === 'state') p.state = m;
    else p.errors.push(m);
  });
  await until(() => p.state);
  return p;
}
async function until(predicate, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Timed out waiting for state'); await sleep(20); }
}
async function send(p, message) { await sleep(140); p.socket.send(JSON.stringify(message)); }
const status = (p, value) => until(() => p.state.status === value);
const move = (p, cell) => send(p, { type: 'move', game: p.state.game.id, revision: p.state.game.revision, cell });

try {
  const a = await peer(), b = await peer();
  a.socket.send('ping'); await until(() => a.pong);
  await send(a, { type: 'join' }); await status(a, 'waiting');
  await send(b, { type: 'join' }); await status(a, 'playing'); await status(b, 'playing');
  assert.equal(a.state.game.id, b.state.game.id);
  assert.notEqual(a.state.color, b.state.color);
  console.log('PASS health, hibernation ping, waiting → matching, fresh board');
  const black = a.state.color === 1 ? a : b, white = black === a ? b : a;
  await move(white, 19); await until(() => white.errors.length);
  assert.equal(black.state.game.revision, 0);
  await move(black, 0); await until(() => black.errors.length);
  await move(black, 19); await until(() => a.state.game.revision === 1 && b.state.game.revision === 1);
  await send(black, { type: 'move', game: black.state.game.id, revision: 0, cell: 19 });
  await until(() => black.errors.length === 2);
  console.log('PASS server rejects wrong turn, illegal move and duplicate/stale move');

  const before = structuredClone(a.state.game);
  a.socket.close(); await until(() => !b.state.opponentOnline);
  let resumed = await peer(a.token), opponent = b;
  assert.deepEqual(resumed.state.game.board, before.board);
  assert.equal(resumed.state.game.revision, before.revision);
  await until(() => b.state.opponentOnline);
  console.log('PASS disconnect notice and authenticated session resume');

  if (scratch) {
    resumed.socket.close(); b.socket.close(); await sleep(200);
    await stopServer(); await startServer();
    resumed = await peer(a.token); opponent = await peer(b.token);
    assert.deepEqual(resumed.state.game.board, before.board);
    assert.equal(resumed.state.game.revision, before.revision);
    console.log('PASS SQLite restores active game after Worker process restart');
  }

  let passes = 0;
  while (!resumed.state.game.ended) {
    const current = resumed.state.game;
    const player = current.turn === resumed.state.color ? resumed : opponent;
    await move(player, current.legal[0]);
    await until(() => resumed.state.game.revision > current.revision && opponent.state.game.revision > current.revision);
    if (resumed.state.game.passed && !resumed.state.game.ended) passes++;
  }
  assert.ok(passes > 0); assert.equal(resumed.state.status, 'finished');
  assert.equal(resumed.state.game.reason, 'scored');
  assert.deepEqual(resumed.state.game.score, opponent.state.game.score);
  console.log(`PASS complete game, ${passes} automatic passes, same final score on both clients`);

  await send(resumed, { type: 'join' }); await status(resumed, 'waiting');
  if (scratch) {
    resumed.socket.close(); opponent.socket.close(); await sleep(200);
    await stopServer(); await startServer();
    resumed = await peer(a.token); opponent = await peer(b.token);
    assert.equal(resumed.state.status, 'waiting');
    console.log('PASS SQLite restores waiting queue after Worker process restart');
  }
  await Promise.all([send(resumed, { type: 'cancel' }), send(opponent, { type: 'join' })]);
  await status(resumed, 'idle'); await until(() => ['waiting', 'finished'].includes(opponent.state.status));
  assert.notEqual(opponent.state.status, 'playing');
  await send(opponent, { type: 'cancel' }); await status(opponent, 'idle');
  console.log('PASS cancel/join race leaves no orphan active game');

  const many = await Promise.all(Array.from({ length: 4 }, () => peer()));
  await Promise.all(many.map(p => send(p, { type: 'join' })));
  await Promise.all(many.map(p => status(p, 'playing')));
  const games = new Map();
  for (const p of many) games.set(p.state.game.id, (games.get(p.state.game.id) || 0) + 1);
  assert.deepEqual([...games.values()], [2, 2]);
  console.log('PASS four simultaneous clients form exactly two games');

  // Replacing a live session must not let the old close event mark it offline.
  const replacement = await peer(many[0].token);
  await sleep(200);
  assert.equal(replacement.state.status, 'playing');
  const partner = many.find(p => p !== many[0] && p.state.game.id === replacement.state.game.id);
  assert.equal(partner.state.opponentOnline, true);
  console.log('PASS session replacement preserves opponent presence');

  // Process death closes TCP without a WebSocket close frame (code 1006).
  const survivor = await peer();
  await send(survivor, { type: 'join' }); await status(survivor, 'waiting');
  const abruptToken = randomBytes(32).toString('hex');
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    const ws = new WebSocket(process.env.TEST_URL, ['othello', 's.' + process.env.TEST_TOKEN]);
    ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'join' })));
  `], { env: { ...process.env, TEST_URL: url.href, TEST_TOKEN: abruptToken }, stdio: 'ignore' });
  try {
    await status(survivor, 'playing');
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGKILL'); await exited;
    await until(() => !survivor.state.opponentOnline);
    const recovered = await peer(abruptToken);
    assert.equal(recovered.state.game.id, survivor.state.game.id);
    await until(() => survivor.state.opponentOnline);
    console.log('PASS abrupt process death is detected and the same session resumes');
  } finally { if (child.exitCode == null && child.signalCode == null) child.kill('SIGKILL'); }
} finally {
  for (const p of peers) if (p.socket.readyState === 1) await send(p, { type: 'cancel' });
  await sleep(200);
  for (const p of peers) p.socket.close();
  await stopServer();
  if (scratch) await rm(scratch, { recursive: true, force: true });
}
