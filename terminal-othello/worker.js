import { DurableObject } from 'cloudflare:workers';
import { Arena, emptyArena, MAX_PLAYERS } from './arena.js';

export class OthelloArena extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS arena (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  load() {
    const rows = this.ctx.storage.sql.exec('SELECT data FROM arena WHERE id=1').toArray();
    return new Arena(rows.length ? JSON.parse(rows[0].data) : emptyArena());
  }

  sockets() { return this.ctx.getWebSockets().filter(ws => ws.readyState === 1); }
  connected() { return new Set(this.sockets().map(ws => ws.deserializeAttachment().id)); }
  save(arena) {
    this.ctx.storage.sql.exec('INSERT OR REPLACE INTO arena (id,data) VALUES (1,?)', JSON.stringify(arena.data));
  }
  async schedule(arena) {
    const deadline = arena.deadline();
    if (deadline != null) await this.ctx.storage.setAlarm(deadline);
    else await this.ctx.storage.deleteAlarm();
  }
  broadcast(arena) {
    const connected = this.connected();
    for (const ws of this.sockets()) {
      const id = ws.deserializeAttachment().id;
      ws.send(JSON.stringify(arena.snapshot(id, connected)));
      if (!arena.data.players[id]) ws.close(4001, 'Session expired');
    }
  }

  async fetch(request) {
    // Serialize admission, persistence and alarm updates with all other events.
    return this.ctx.blockConcurrencyWhile(async () => {
      const protocols = (request.headers.get('Sec-WebSocket-Protocol') || '').split(',').map(x => x.trim());
      const token = protocols.find(x => /^s\.[a-f0-9]{64}$/.test(x));
      if (!protocols.includes('othello') || !token) return new Response('Invalid session', { status: 401 });
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
      const id = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
      const arena = this.load();
      const existing = this.sockets().filter(ws => ws.deserializeAttachment().id === id);
      if (this.sockets().length - existing.length >= MAX_PLAYERS) return new Response('Server full', { status: 503 });
      try { arena.connect(id); } catch { return new Response('Server full', { status: 503 }); }
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ id, window: Date.now(), count: 0 });
      for (const old of existing) old.close(4002, 'Session opened elsewhere');
      arena.match(id, this.connected());
      this.save(arena); await this.schedule(arena); this.broadcast(arena);
      return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'othello' } });
    });
  }

  async webSocketMessage(ws, raw) {
    return this.ctx.blockConcurrencyWhile(async () => {
      if (ws.readyState !== 1) return;
      const attachment = ws.deserializeAttachment();
      if (typeof raw !== 'string' || raw.length > 512) { ws.close(1009, 'Message too large'); return; }
      if (Date.now() - attachment.window >= 1000) { attachment.window = Date.now(); attachment.count = 0; }
      if (++attachment.count > 10) { ws.close(1008, 'Too many messages'); return; }
      ws.serializeAttachment(attachment);
      const arena = this.load();
      arena.sweep();
      let error;
      try { arena.command(attachment.id, JSON.parse(raw), this.connected()); }
      catch (e) { error = e instanceof SyntaxError ? '不正な JSON です' : e.message; }
      this.save(arena); await this.schedule(arena); this.broadcast(arena);
      if (error) ws.send(JSON.stringify({ type: 'error', message: error }));
    });
  }

  async disconnected(ws) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const { id } = ws.deserializeAttachment();
      if (this.connected().has(id)) return; // A replacement connection owns this session.
      const arena = this.load(); arena.disconnect(id);
      this.save(arena); await this.schedule(arena); this.broadcast(arena);
    });
  }
  async webSocketClose(ws) { ws.close(1000, 'Connection closed'); await this.disconnected(ws); }
  async webSocketError(ws) { ws.close(1011, 'Connection error'); await this.disconnected(ws); }
  async alarm() {
    return this.ctx.blockConcurrencyWhile(async () => {
      const arena = this.load(); arena.sweep();
      this.save(arena); await this.schedule(arena); this.broadcast(arena);
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health')
      return Response.json({ ok: true, service: 'terminal-othello', protocol: 1 });
    if (url.pathname !== '/connect') return new Response('Not found', { status: 404 });
    if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
      return new Response('WebSocket required', { status: 426 });
    return env.ARENA.get(env.ARENA.idFromName('public-v1')).fetch(request);
  }
};
