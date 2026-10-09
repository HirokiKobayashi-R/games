// Eight automatic retries at most per outage. A brief open/close does not reset
// the outage; only a minute of stable connectivity or explicit user action does.
export class Retry {
  constructor(random = Math.random) { this.random = random; this.reset(); }
  reset() { this.attempts = 0; this.since = null; }
  next(now, openedAt = null) {
    if (openedAt != null && now - openedAt >= 60_000) this.reset();
    this.since ??= now;
    if (this.attempts >= 8 || now - this.since >= 120_000) return null;
    return Math.min(30_000, Math.round(1000 * 2 ** this.attempts++ * (.8 + this.random() * .4)));
  }
}
