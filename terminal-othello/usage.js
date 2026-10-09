// Conservative admission budgets, not a Cloudflare billing/spending cap.
// Reserve small batches before work: unused credits are lost on eviction, never
// refunded. One bounded row survives reconnects, hibernation and deployments.
export const USAGE_LIMITS = Object.freeze({ daily: 20_000, dailyConnections: 1000,
  minute: 1200, minuteConnections: 120, sessionMinute: 120, sessionConnections: 6,
  identities: 128, batch: 8 });

export class Usage {
  constructor(sql) {
    this.sql = sql;
    sql.exec('CREATE TABLE IF NOT EXISTS usage (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
    this.data = JSON.parse(sql.exec('SELECT data FROM usage WHERE id=1').toArray()[0]?.data || 'null');
    this.leases = new Map();
  }

  admit(id, connection = false, now = Date.now()) {
    const day = Math.floor(now / 86_400_000), minute = Math.floor(now / 60_000), limits = USAGE_LIMITS;
    let data = this.data;
    if (!data || day > data.day) data = { day, events: 0, connections: 0, minute, used: 0, opened: 0, peers: {} };
    else if (minute > data.minute) data = { ...data, minute, used: 0, opened: 0, peers: {} };
    if (data !== this.data) { this.leases.clear(); this.data = data; }
    const lease = this.leases.get(id) || 0;
    if (!connection && lease) { this.leases.set(id, lease - 1); return null; }
    const peer = data.peers[id] || { events: 0, connections: 0 };
    if (data.events >= limits.daily || connection && data.connections >= limits.dailyConnections) return 'daily';
    if (!data.peers[id] && Object.keys(data.peers).length >= limits.identities) return 'rate';
    if (connection && (data.opened >= limits.minuteConnections || peer.connections >= limits.sessionConnections)) return 'rate';
    const grant = Math.min(connection ? 1 : limits.batch, limits.daily - data.events,
      limits.minute - data.used, limits.sessionMinute - peer.events);
    if (grant <= 0) return 'rate';
    const next = { ...data, events: data.events + grant, connections: data.connections + Number(connection),
      used: data.used + grant, opened: data.opened + Number(connection),
      peers: { ...data.peers, [id]: { events: peer.events + grant, connections: peer.connections + Number(connection) } } };
    // Publish in-memory credits only after the reservation has been stored.
    this.sql.exec('INSERT OR REPLACE INTO usage (id,data) VALUES (1,?)', JSON.stringify(next));
    this.data = next;
    if (!connection) this.leases.set(id, grant - 1);
    return null;
  }
}
