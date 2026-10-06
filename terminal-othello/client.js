#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { emitKeypressEvents } from 'node:readline';
import { initialGame, play, cpuMove, parseCoordinate } from './rules.js';
import { renderScreen, boardChange, fitsBoard } from './render.js';

const args = process.argv.slice(2);
let endpoint = process.env.OTHELLO_URL || 'http://127.0.0.1:8787', sessionFile;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--url' && args[i + 1]) endpoint = args[++i];
  else if (args[i] === '--session' && args[i + 1]) sessionFile = args[++i];
  else if (args[i] === '--help') {
    console.log('terminal-othello [--url https://WORKER.workers.dev] [--session player.session.json]\n矢印 / a1〜h8 + Enter: 着手 | m: 待機キャンセル・再開 | n: CPU 新盤面 | r: 次の対戦 | q / Ctrl-C: 終了\n同じ --session ファイルで起動すると切断後 2 分以内に対局を再開できます。');
    process.exit(0);
  } else { console.error('不明な引数です。--help を参照してください。'); process.exit(1); }
}
if (!process.stdin.isTTY || !process.stdout.isTTY) { console.error('対話型ターミナルで実行してください。'); process.exit(1); }
let url, token = randomBytes(32).toString('hex');
try {
  url = new URL(endpoint);
  if (!['https:', 'http:', 'wss:', 'ws:'].includes(url.protocol)) throw new Error('URL');
  if (['http:', 'ws:'].includes(url.protocol) && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new Error('公開サーバーには HTTPS / WSS が必要です');
  if (url.username || url.password) throw new Error('認証情報付き URL は使えません');
  url.protocol = ['https:', 'wss:'].includes(url.protocol) ? 'wss:' : 'ws:';
  url.pathname = '/connect'; url.search = ''; url.hash = '';
  if (sessionFile) {
    try {
      const saved = JSON.parse(readFileSync(sessionFile, 'utf8'));
      if (!/^[a-f0-9]{64}$/.test(saved.token) || saved.endpoint !== url.href) throw new Error('セッションの形式または接続先が違います');
      token = saved.token;
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      writeFileSync(sessionFile, JSON.stringify({ endpoint: url.href, token }) + '\n', { mode: 0o600, flag: 'wx' });
    }
  }
} catch { console.error('起動できません。URL とセッションファイルの形式・接続先・アクセス権を確認してください。'); process.exit(1); }

let ws, retryTimer, heartbeat, connectTimer, cpuTimer, exitTimer;
let quitting = false, online = false, searching = true, joined = false, backoff = 1000;
let remote = null, local = initialGame(), cursor = 19, typed = '', note = '接続中。CPU と練習できます。';
let lastPong = Date.now(), previousGame = null;
const isRemote = () => !!remote?.game;
const send = message => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message)); };

const colorDepth = process.stdout.getColorDepth();
const colors = process.env.NO_COLOR || process.env.TERM === 'dumb' || colorDepth < 4 ? 0 : colorDepth;
let visualBoard, visualKey, effect = null, phase = 3, lastMove = -1, animationTimer, cpuRound = 0;
function draw() {
  if (quitting) return;
  const game = isRemote() ? remote.game : local;
  const key = isRemote() ? remote.game.id : `cpu-${cpuRound}`;
  if (visualKey !== key || !visualBoard || game.board.some((v, i) => v !== visualBoard[i])) {
    clearTimeout(animationTimer);
    effect = visualKey === key ? boardChange(visualBoard, game.board) : null;
    lastMove = effect?.placed ?? -1;
    visualKey = key; visualBoard = [...game.board];
    phase = effect && colors ? 0 : 3;
    if (phase < 3) animationTimer = setTimeout(animate, 80);
  }
  const lines = renderScreen({ game, remote: isRemote(), color: isRemote() ? remote.color : 1,
    opponentOnline: remote?.opponentOnline, online, searching, cursor, typed, note,
    last: lastMove, effect, phase, columns: process.stdout.columns, rows: process.stdout.rows, colors });
  process.stdout.write('\x1b[H' + lines.map(line => line + '\x1b[0m\x1b[K').join('\r\n') + '\x1b[J');
}
function animate() {
  if (quitting) return;
  phase++; draw();
  if (phase < 3) animationTimer = setTimeout(animate, 80);
}

function runCPU() {
  clearTimeout(cpuTimer);
  if (isRemote() || local.ended || local.turn !== 2 || quitting) return;
  cpuTimer = setTimeout(() => {
    if (isRemote() || quitting) return;
    local = play(local, 2, cpuMove(local)); draw(); runCPU();
  }, 350);
}

function connect() {
  if (quitting) return;
  joined = false;
  ws = new WebSocket(url, ['othello', `s.${token}`]);
  const socket = ws;
  let lost = false;
  function reconnect(message) {
    if (lost || socket !== ws) return;
    lost = true;
    clearTimeout(connectTimer); clearInterval(heartbeat); online = false;
    if (quitting) { finish(); return; }
    note = message; draw();
    retryTimer = setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 15_000);
    socket.close();
  }
  connectTimer = setTimeout(() => reconnect('接続が時間切れです。自動再接続します。'), 10_000);
  socket.addEventListener('open', () => {
    if (lost || socket !== ws) { socket.close(); return; }
    clearTimeout(connectTimer); online = true; lastPong = Date.now(); backoff = 1000;
    heartbeat = setInterval(() => {
      if (Date.now() - lastPong > 55_000) reconnect('応答がありません。自動再接続します。');
      else if (socket.readyState === WebSocket.OPEN) socket.send('ping');
    }, 20_000);
    draw();
  });
  socket.addEventListener('message', event => {
    if (lost || socket !== ws) return;
    if (event.data === 'pong') { lastPong = Date.now(); return; }
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === 'error') note = message.message;
    else if (message.type === 'state') {
      remote = message;
      if (quitting) { if (message.status === 'idle') finish(); return; }
      if (!searching && (message.status === 'waiting' || message.status === 'playing')) send({ type: 'cancel' });
      else if (searching && ['idle', 'expired'].includes(message.status) && !joined) {
        joined = true; send({ type: 'join' });
      }
      if (message.status === 'playing') {
        clearTimeout(cpuTimer);
        if (previousGame !== message.game.id) {
          previousGame = message.game.id; local = initialGame(); typed = ''; cursor = message.game.legal[0] ?? 0;
          note = '対戦相手が見つかりました。新しい盤面で開始！'; process.stdout.write('\x07');
        }
      } else if (message.status === 'waiting') note = '相手を検索中。見つかるまで CPU と遊べます。';
      runCPU();
    }
    draw();
  });
  // Node may emit error without close when the initial TCP/TLS handshake fails.
  socket.addEventListener('error', () => reconnect('接続できません。CPU で遊びながら再接続します。'));
  socket.addEventListener('close', event => {
    if (lost || socket !== ws) return;
    if (quitting) { finish(); return; }
    if (event.code === 4002) { note = '同じセッションが別の端末で開かれました。'; quit(false); return; }
    reconnect('切断しました。同じセッションで自動復帰します。');
  });
}

function finish() {
  clearTimeout(animationTimer); clearTimeout(exitTimer); clearTimeout(retryTimer); clearTimeout(connectTimer); clearTimeout(cpuTimer); clearInterval(heartbeat);
  if (process.stdin.isRaw) process.stdin.setRawMode(false);
  process.stdin.pause();
  process.stdout.write('\x1b[0m\x1b[?25h\x1b[?1049l');
  process.exit(0);
}
function quit(cancel = true) {
  if (quitting) return;
  quitting = true; searching = false;
  clearTimeout(animationTimer); clearTimeout(retryTimer); clearTimeout(cpuTimer);
  if (cancel && ws?.readyState === WebSocket.OPEN) {
    send({ type: 'cancel' }); exitTimer = setTimeout(finish, 1000);
  } else finish();
}

emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdout.write('\x1b[?1049h\x1b[?25l');
process.on('exit', () => {
  if (process.stdin.isRaw) process.stdin.setRawMode(false);
  process.stdout.write('\x1b[0m\x1b[?25h\x1b[?1049l');
});
process.on('SIGINT', () => quit()); process.on('SIGTERM', () => quit());
process.stdout.on('resize', draw);
process.stdin.on('keypress', (text, key = {}) => {
  if (quitting) return;
  if ((key.ctrl && key.name === 'c') || key.name === 'q') { quit(); return; }
  if (!fitsBoard(process.stdout.columns, process.stdout.rows) && key.name !== 'm') return;
  if (key.name === 'm') {
    searching = !searching;
    if (isRemote() && !remote.game.ended) searching = false;
    send({ type: searching ? 'join' : 'cancel' }); joined = searching;
    note = searching ? '検索を再開します。' : '検索・対戦をキャンセルしました。';
  } else if (key.name === 'r' && (!isRemote() || remote.game.ended)) {
    remote = null; local = initialGame(); cpuRound++; searching = true; joined = true; previousGame = null;
    send({ type: 'join' });
  } else if (key.name === 'n' && !isRemote()) { local = initialGame(); cpuRound++; clearTimeout(cpuTimer); }
  else if (key.name === 'escape') typed = '';
  else if (key.name === 'backspace') typed = typed.slice(0, -1);
  else if (key.name === 'left') { cursor = (cursor + 63) % 64; typed = ''; }
  else if (key.name === 'right') { cursor = (cursor + 1) % 64; typed = ''; }
  else if (key.name === 'up') { cursor = (cursor + 56) % 64; typed = ''; }
  else if (key.name === 'down') { cursor = (cursor + 8) % 64; typed = ''; }
  else if (key.name === 'return') {
    const cell = typed ? parseCoordinate(typed) : cursor; typed = '';
    if (isRemote()) {
      if (online) send({ type: 'move', game: remote.game.id, revision: remote.game.revision, cell });
      else note = '復帰するまで対人戦への着手を待ってください。';
    } else if (local.turn === 1 && !local.ended) {
      try { local = play(local, 1, cell); note = 'CPU 練習中。'; runCPU(); }
      catch (e) { note = e.message; }
    }
  } else if (/^[a-h1-8]$/i.test(text || '')) typed = (typed + text.toLowerCase()).slice(-2);
  draw();
});
draw(); connect();
