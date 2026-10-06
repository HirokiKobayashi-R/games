import { initialGame, play, score, legalMoves } from './rules.js';

export const RECONNECT_MS = 120_000;
export const IDLE_MS = 30 * 60_000;
export const MAX_PLAYERS = 128;
export const emptyArena = () => ({ players: {}, games: {} });

// Every transition is synchronous; the DO persists it before sending snapshots.
export class Arena {
  constructor(data = emptyArena(), now = Date.now(), random = Math.random) {
    this.data = data; this.now = now; this.random = random;
  }

  connect(id) {
    this.sweep();
    let p = this.data.players[id];
    if (!p) {
      if (Object.keys(this.data.players).length >= MAX_PLAYERS) throw new Error('サーバーが満員です');
      p = this.data.players[id] = { status: 'idle', game: null };
    }
    p.offline = null; p.touched = this.now;
  }

  disconnect(id) {
    const p = this.data.players[id];
    if (p) p.offline = this.now;
  }

  finish(game, reason, winner = null) {
    game.ended = true; game.turn = 0; game.reason = reason; game.winner = winner;
    game.revision++; game.updated = this.now;
    for (const id of game.players) {
      const p = this.data.players[id];
      if (p?.game === game.id) p.status = 'finished';
    }
  }

  leave(id) {
    const p = this.data.players[id], game = this.data.games[p.game];
    if (game && !game.ended) this.finish(game, 'cancelled', 2 - game.players.indexOf(id));
    p.game = null; p.status = 'idle';
  }

  command(id, message, connected) {
    const p = this.data.players[id];
    if (!p) throw new Error('セッションが期限切れです');
    if (!message || typeof message !== 'object') throw new Error('不正な操作です');
    if (message.type === 'cancel') this.leave(id);
    else if (message.type === 'join') {
      if (p.status === 'playing') throw new Error('対戦中です');
      p.game = null; p.status = 'waiting';
      this.match(id, connected);
    } else if (message.type === 'move') {
      const game = this.data.games[p.game];
      if (p.status !== 'playing' || !game || message.game !== game.id || message.revision !== game.revision)
        throw new Error('盤面が更新されています');
      const next = play(game, game.players.indexOf(id) + 1, message.cell);
      Object.assign(game, next, { updated: this.now });
      if (game.ended) {
        const s = score(game.board);
        this.finish(game, 'scored', s.black === s.white ? 0 : s.black > s.white ? 1 : 2);
      }
    } else if (message.type !== 'sync') throw new Error('不明な操作です');
    p.touched = this.now;
    this.sweep();
  }

  match(id, connected) {
    const p = this.data.players[id];
    if (p?.status !== 'waiting' || !connected.has(id)) return;
    const candidates = Object.entries(this.data.players)
      .filter(([other, q]) => other !== id && q.status === 'waiting' && connected.has(other));
    if (!candidates.length) return;
    const [other] = candidates[Math.floor(this.random() * candidates.length)];
    const players = this.random() < 0.5 ? [id, other] : [other, id];
    const game = { ...initialGame(), id: crypto.randomUUID(), players, updated: this.now };
    this.data.games[game.id] = game;
    for (const player of players) Object.assign(this.data.players[player], { status: 'playing', game: game.id });
  }

  sweep() {
    for (const game of Object.values(this.data.games)) {
      if (!game.ended) {
        const offline = game.players.map(id => this.data.players[id]?.offline);
        const expired = offline.map(t => t != null && this.now - t >= RECONNECT_MS);
        if (expired.some(Boolean)) this.finish(game, 'disconnected', expired[0] && expired[1] ? 0 : expired[0] ? 2 : 1);
        else if (this.now - game.updated >= IDLE_MS) this.finish(game, 'inactive', 0);
      }
    }
    for (const [id, p] of Object.entries(this.data.players)) {
      if (p.status === 'waiting' && p.offline != null && this.now - p.offline >= RECONNECT_MS) p.status = 'idle';
      if (p.status !== 'playing' && this.now - p.touched >= IDLE_MS) delete this.data.players[id];
    }
    const referenced = new Set(Object.values(this.data.players).map(p => p.game));
    for (const id of Object.keys(this.data.games)) if (!referenced.has(id)) delete this.data.games[id];
  }

  deadline() {
    const times = [];
    for (const p of Object.values(this.data.players)) {
      if (p.status !== 'playing') times.push(p.touched + IDLE_MS);
      if ((p.status === 'playing' || p.status === 'waiting') && p.offline != null) times.push(p.offline + RECONNECT_MS);
    }
    for (const g of Object.values(this.data.games)) if (!g.ended) times.push(g.updated + IDLE_MS);
    return times.length ? Math.max(this.now + 1000, Math.min(...times)) : null;
  }

  snapshot(id, connected) {
    const p = this.data.players[id];
    if (!p) return { type: 'state', status: 'expired' };
    const g = this.data.games[p.game];
    const color = g ? g.players.indexOf(id) + 1 : null;
    return { type: 'state', status: p.status, color,
      opponentOnline: g ? connected.has(g.players[2 - color]) : false,
      game: g ? { id: g.id, board: g.board, turn: g.turn, revision: g.revision,
        ended: g.ended, passed: g.passed, reason: g.reason, winner: g.winner,
        score: score(g.board), legal: g.ended ? [] : legalMoves(g.board, g.turn) } : null };
  }
}
