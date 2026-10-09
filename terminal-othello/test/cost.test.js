import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Arena, IDLE_MS } from '../arena.js';
import { Usage, USAGE_LIMITS as LIMIT } from '../usage.js';
import { Retry } from '../retry.js';

// Run the production handlers with deterministic storage/socket doubles. These
// counters measure calls, not Cloudflare billed rows or real hibernation time.
const source = readFileSync(new URL('../worker.js', import.meta.url), 'utf8')
  .replace("import { DurableObject } from 'cloudflare:workers';", 'class DurableObject { constructor(ctx) { this.ctx = ctx; } }')
  .replace(/from '(\.\/[^']+)'/g, (_, path) => `from '${new URL('../' + path, import.meta.url)}'`);
const { OthelloArena, default: edge } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
globalThis.WebSocketRequestResponsePair = class {};
class Socket {
  readyState = 1; attachment = {}; messages = [];
  serializeAttachment(value) { this.attachment = structuredClone(value); }
  deserializeAttachment() { return structuredClone(this.attachment); }
  send(value) { this.messages.push(JSON.parse(value)); }
  close(code) { this.readyState = 3; this.code = code; }
}
globalThis.WebSocketPair = class { constructor() { this[0] = new Socket(); this[1] = new Socket(); } };
const NativeResponse = globalThis.Response;
globalThis.Response = class extends NativeResponse {
  constructor(body, options) { if (options?.status === 101) return { ...options }; super(body, options); }
};
function fixture(count = 0) {
  const tables = {}, counts = { reads: 0, arena: 0, usage: 0, setAlarm: 0, deleteAlarm: 0 };
  let alarm = null;
  const sql = { exec(query, value) {
    if (query.startsWith('CREATE')) return;
    const table = /(?:FROM|INTO) (\w+)/.exec(query)[1];
    if (query.startsWith('SELECT')) { counts.reads++; return { toArray: () => tables[table] ? [{ data: tables[table] }] : [] }; }
    counts[table]++; tables[table] = value;
  } };
  const a = new Arena(), sockets = [];
  for (let i = 0; i < count; i++) {
    const id = String(i).padStart(64, '0'); a.connect(id);
    const ws = new Socket(); ws.serializeAttachment({ id, window: Date.now(), count: 0 }); sockets.push(ws);
  }
  tables.arena = JSON.stringify(a.data);
  const ctx = { storage: { sql, getAlarm: async () => alarm,
    setAlarm: async value => { counts.setAlarm++; alarm = value; },
    deleteAlarm: async () => { counts.deleteAlarm++; alarm = null; } },
  blockConcurrencyWhile: fn => fn(), getWebSockets: () => sockets,
  acceptWebSocket: ws => sockets.push(ws), setWebSocketAutoResponse() {} };
  return { ctx, sql, counts, sockets, tables, worker: new OthelloArena(ctx), alarm: () => alarm,
    async fire() { alarm = null; await this.worker.alarm(); },
    reset() { for (const k in counts) counts[k] = 0; for (const ws of sockets) ws.messages = []; } };
}
const req = (n = 1) => new Request('https://test.invalid/connect', {
  headers: { Upgrade: 'websocket', 'Sec-WebSocket-Protocol': 'othello, s.' + n.toString(16).padStart(64, '0') } });
const sends = f => f.sockets.reduce((sum, ws) => sum + ws.messages.length, 0);

test('invalid input and sync have bounded reservations, no arena writes or unrelated broadcasts', async t => {
  t.mock.method(Date, 'now', () => 1_000_000);
  const f = fixture(128); await f.worker.commit(f.worker.load()); f.reset();
  for (let i = 0; i < 10; i++) await f.worker.webSocketMessage(f.sockets[0], '{"type":"sync"}');
  assert.equal(f.counts.arena, 0); assert.equal(f.counts.setAlarm, 0); assert.equal(f.counts.usage, 2);
  assert.equal(sends(f), 10); assert.equal(f.sockets[1].messages.length, 0);
  await f.worker.webSocketMessage(f.sockets[0], '{"type":"sync"}'); assert.equal(f.sockets[0].code, 1008);
  f.reset();
  for (let i = 0; i < 100; i++) await f.worker.webSocketMessage(f.sockets[1], '{');
  assert.equal(f.sockets[1].code, 1008); assert.equal(f.counts.arena, 0); assert.equal(sends(f), 0);
  assert.equal(f.counts.usage, 1); assert.equal(f.counts.setAlarm, 0);
  for (const raw of ['null', '{"type":"unknown"}', 'x'.repeat(513), new ArrayBuffer(1)]) {
    const g = fixture(1); g.reset(); await g.worker.webSocketMessage(g.sockets[0], raw);
    assert.equal(g.counts.arena, 0); assert.equal(g.counts.setAlarm, 0); assert.equal(sends(g), 0);
  }
  console.log('COST sync x10: arena=0 alarm=0 quota=2 sends=10; invalid x100: arena=0 alarm=0 quota=1 sends=0');
});

test('reconnect admission and message reservations survive eviction; many identities remain bounded', async t => {
  let now = 1_000_000; t.mock.method(Date, 'now', () => now);
  const f = fixture();
  for (let i = 0; i < 100; i++) {
    f.worker = new OthelloArena(f.ctx);
    assert.equal((await f.worker.fetch(req())).status, i < LIMIT.sessionConnections ? 101 : 429);
    if (i < LIMIT.sessionConnections) {
      await f.worker.webSocketMessage(f.sockets.at(-1), '{');
      await f.worker.webSocketClose(f.sockets.at(-1));
    }
    now += 100;
  }
  assert.equal(f.counts.arena, 12); assert.equal(f.counts.usage, 12); assert.equal(f.counts.setAlarm, 6);
  const q = fixture();
  for (let i = 0; i < LIMIT.sessionMinute / LIMIT.batch; i++) assert.equal(new Usage(q.sql).admit('one'), null);
  assert.equal(new Usage(q.sql).admit('one'), 'rate');
  for (let i = 0; i < 1000; i++) new Usage(q.sql).admit('new-' + i);
  assert.ok(Object.keys(JSON.parse(q.tables.usage).peers).length <= LIMIT.identities);
  assert.ok(JSON.parse(q.tables.usage).used <= LIMIT.minute);
  console.log('COST reconnect/invalid/close x100 with eviction: admitted=6 arena=12 quota=12 alarm=6');
});

test('daily work and connection budgets fail closed, retain spent credits, and reset only next UTC day', () => {
  const f = fixture(); const usage = new Usage(f.sql);
  let admitted = 0;
  for (let m = 0; m < 100; m++) for (let i = 0; i < 1500; i++) {
    if (!usage.admit('peer-' + (i % 128), false, m * 60_000)) admitted++;
  }
  assert.equal(JSON.parse(f.tables.usage).events, LIMIT.daily); assert.ok(admitted > 0 && admitted <= LIMIT.daily);
  const writes = f.counts.usage;
  assert.equal(new Usage(f.sql).admit('new', false, 100 * 60_000), 'daily');
  assert.equal(f.counts.usage, writes);
  assert.equal(new Usage(f.sql).admit('new', false, 86_400_000), null);
  const g = fixture(); const connections = new Usage(g.sql); let accepted = 0;
  for (let m = 0; m < 20; m++) for (let i = 0; i < 120; i++) if (!connections.admit('peer-' + i, true, m * 60_000)) accepted++;
  assert.equal(accepted, LIMIT.dailyConnections);
  assert.equal(new Usage(g.sql).admit('fresh', true, 30 * 60_000), 'daily');
  const failed = fixture(); const guard = new Usage(failed.sql);
  failed.sql.exec = () => { throw new Error('storage unavailable'); };
  assert.throws(() => guard.admit('a')); assert.equal(guard.leases.size, 0);
  console.log(`COST simulated day: processed<=${admitted} quota writes=${writes}; connections<=${accepted}`);
});

test('no-op requests and rejected moves do not write; changed states go only to affected players', async t => {
  let now = 1_000_000; t.mock.method(Date, 'now', () => now);
  const f = fixture(3); await f.worker.commit(f.worker.load());
  await f.worker.webSocketMessage(f.sockets[0], '{"type":"join"}');
  await f.worker.webSocketMessage(f.sockets[1], '{"type":"join"}');
  f.reset(); now += 1000;
  await f.worker.webSocketMessage(f.sockets[0], '{"type":"move","cell":0}');
  assert.equal(f.counts.arena, 0); assert.equal(f.counts.setAlarm, 0); assert.equal(sends(f), 1);
  const a = f.worker.load(), g = Object.values(a.data.games)[0];
  const black = f.sockets.find(ws => ws.attachment.id === g.players[0]); f.reset();
  await f.worker.webSocketMessage(black, JSON.stringify({ type: 'move', game: g.id, revision: 0, cell: 19 }));
  assert.equal(f.counts.arena, 1); assert.equal(sends(f), 2); assert.equal(f.sockets[2].messages.length, 0);
  f.reset(); now += 1000;
  await f.worker.webSocketMessage(f.sockets[2], '{"type":"cancel"}');
  assert.equal(f.counts.arena, 0); assert.equal(f.counts.setAlarm, 0); assert.equal(sends(f), 0);
});

test('disconnect duplicates and alarm replay stop writing and rescheduling after cleanup', async t => {
  let now = 1_000_000; t.mock.method(Date, 'now', () => now);
  const f = fixture(2); await f.worker.commit(f.worker.load());
  for (const ws of f.sockets) await f.worker.webSocketMessage(ws, '{"type":"join"}');
  f.sockets[0].close(); await f.worker.disconnected(f.sockets[0]); f.reset();
  for (let i = 0; i < 100; i++) await f.worker.disconnected(f.sockets[0]);
  assert.equal(f.counts.arena, 0); assert.equal(f.counts.setAlarm, 0); assert.equal(sends(f), 0);
  now += 120_000; await f.fire();
  now += IDLE_MS; await f.fire();
  assert.equal(f.alarm(), null);
  assert.deepEqual(f.worker.load().data, { players: {}, games: {} });
  f.reset(); for (let i = 0; i < 100; i++) await f.fire();
  assert.equal(f.counts.arena, 0); assert.equal(f.counts.setAlarm, 0); assert.equal(sends(f), 0);
});

test('edge rejects malformed sessions without entering the DO', async () => {
  let calls = 0;
  const env = { ARENA: { idFromName() { calls++; throw Error('Must not reach DO'); } } };
  for (const header of ['', 'othello', 'othello, s.bad', 'othello, ' + 'x'.repeat(1000)]) {
    const r = await edge.fetch(new Request('https://test.invalid/connect', { headers: { Upgrade: 'websocket', 'Sec-WebSocket-Protocol': header } }), env);
    assert.equal(r.status, 401);
  }
  assert.equal(calls, 0);
});

test('retry stops, jitters, preserves outage across brief opens and resets after a stable minute', () => {
  const retry = new Retry(() => .5);
  const delays = Array.from({ length: 8 }, (_, i) => retry.next(i * 1000, i * 1000));
  assert.deepEqual(delays, [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  assert.equal(retry.next(9000, 9000), null);
  assert.equal(retry.next(70_000, 10_000), 1000);
  assert.equal(retry.next(190_000), null);
  retry.reset(); assert.equal(retry.next(190_000), 1000);
  assert.equal(new Retry(() => 0).next(0), 800);
  assert.equal(new Retry(() => 1).next(0), 1200);
});
