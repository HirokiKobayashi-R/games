import { DurableObject } from 'cloudflare:workers';
import { Arena, emptyArena, MAX_PLAYERS } from './arena.js';
import { Usage } from './usage.js';

function sessionToken(request) {
  const header = request.headers.get('Sec-WebSocket-Protocol') || '';
  if (header.length > 100) return null;
  const protocols = header.split(',').map(x => x.trim());
  return protocols.length === 2 && protocols.includes('othello')
    ? protocols.find(x => /^s\.[a-f0-9]{64}$/.test(x)) : null;
}

export class OthelloArena extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS arena (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
    this.usage = new Usage(ctx.storage.sql);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  load() {
    if (!this.data) {
      const rows = this.ctx.storage.sql.exec('SELECT data FROM arena WHERE id=1').toArray();
      this.data = rows.length ? JSON.parse(rows[0].data) : emptyArena();
      this.saved = JSON.stringify(this.data);
    }
    return new Arena(this.data);
  }

  sockets() { return this.ctx.getWebSockets().filter(ws => ws.readyState === 1); }
  connected() { return new Set(this.sockets().map(ws => ws.deserializeAttachment().id)); }
  async commit(arena, force = null) {
    const data = JSON.stringify(arena.data);
    if (data !== this.saved) {
      this.ctx.storage.sql.exec('INSERT OR REPLACE INTO arena (id,data) VALUES (1,?)', data);
      this.saved = data;
    }
    const deadline = arena.deadline();
    if (this.scheduled === undefined) this.scheduled = await this.ctx.storage.getAlarm();
    if (deadline !== this.scheduled) {
      if (deadline != null) await this.ctx.storage.setAlarm(deadline);
      else await this.ctx.storage.deleteAlarm();
      this.scheduled = deadline;
    }
    const connected = this.connected();
    for (const ws of this.sockets()) {
      const attachment = ws.deserializeAttachment();
      const state = JSON.stringify(arena.snapshot(attachment.id, connected));
      if (state !== attachment.state || ws === force) {
        this.send(ws, state);
        attachment.state = state; ws.serializeAttachment(attachment);
      }
      if (!arena.data.players[attachment.id]) ws.close(4001, 'Session expired');
    }
  }
  send(ws, message) {
    try { ws.send(message); } catch { ws.close(1011, 'Send failed'); }
  }

  async fetch(request) {
    // Serialize admission, persistence and alarm updates with all other events.
    return this.ctx.blockConcurrencyWhile(async () => {
      const token = sessionToken(request);
      if (!token) return new Response('Invalid session', { status: 401 });
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
      const id = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
      if (this.usage.admit(id, true)) return new Response('Admission limit reached', { status: 429, headers: { 'Retry-After': '60' } });
      const arena = this.load();
      const existing = this.sockets().filter(ws => ws.deserializeAttachment().id === id);
      if (this.sockets().length - existing.length >= MAX_PLAYERS) return new Response('Server full', { status: 503 });
      try { arena.connect(id); } catch { return new Response('Server full', { status: 503 }); }
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ id, window: Date.now(), count: 0 });
      for (const old of existing) old.close(4002, 'Session opened elsewhere');
      arena.match(id, this.connected());
      await this.commit(arena);
      return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'othello' } });
    });
  }

  async webSocketMessage(ws, raw) {
    return this.ctx.blockConcurrencyWhile(async () => {
      if (ws.readyState !== 1) return;
      const attachment = ws.deserializeAttachment();
      if (this.usage.admit(attachment.id)) { ws.close(4008, 'Admission limit reached'); return; }
      if (typeof raw !== 'string' || raw.length > 512) { ws.close(1009, 'Message too large'); return; }
      if (Date.now() - attachment.window >= 1000) { attachment.window = Date.now(); attachment.count = 0; }
      if (++attachment.count > 10) { ws.close(1008, 'Too many messages'); return; }
      ws.serializeAttachment(attachment);
      let message;
      try { message = JSON.parse(raw); } catch { ws.close(1008, 'Invalid JSON'); return; }
      if (!message || typeof message !== 'object' || !['join', 'cancel', 'move', 'sync'].includes(message.type)) {
        ws.close(1008, 'Invalid command'); return;
      }
      const arena = this.load();
      arena.sweep();
      let error;
      try { arena.command(attachment.id, message, this.connected()); } catch (e) { error = e.message; }
      await this.commit(arena, message.type === 'sync' ? ws : null);
      if (error) this.send(ws, JSON.stringify({ type: 'error', message: error }));
    });
  }

  async disconnected(ws) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const { id } = ws.deserializeAttachment();
      if (this.connected().has(id)) return; // A replacement connection owns this session.
      const arena = this.load(); arena.disconnect(id); arena.sweep();
      await this.commit(arena);
    });
  }
  async webSocketClose(ws) { ws.close(1000, 'Connection closed'); await this.disconnected(ws); }
  async webSocketError(ws) { ws.close(1011, 'Connection error'); await this.disconnected(ws); }
  async alarm() {
    return this.ctx.blockConcurrencyWhile(async () => {
      this.scheduled = null; // The running alarm has been consumed.
      const arena = this.load(); arena.sweep();
      await this.commit(arena);
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
    if (!sessionToken(request)) return new Response('Invalid session', { status: 401 });
    return env.ARENA.get(env.ARENA.idFromName('public-v1')).fetch(request);
  }
};
