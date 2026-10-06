<p align="center"><strong>English</strong> &nbsp; / &nbsp; <a href="README.ja.md">日本語</a></p>

<h1 align="center">● Terminal Othello ○</h1>
<p align="center">Find a rival. Practice while you wait. Play in your terminal.</p>
<p align="center"><code>Node.js 22+</code> &nbsp; <code>No runtime dependencies</code> &nbsp; <a href="https://github.com/HirokiKobayashi-R/games/releases/tag/v0.4.0">Download v0.4.0</a></p>

---

A small online Othello proof of concept, played entirely in the terminal. No room codes, room creation, or registration.

- **Random opponents.** Matchmaking starts on launch; colors are randomized too.
- **Practice while waiting.** Play a local CPU until a rival arrives. A bell and message announce the match, which starts on a fresh board.
- **Server-validated play.** Legal moves, turns, passes, and results are checked by the server. Cancellation races and reconnection are handled.

Documentation is available in both languages. Game messages and Codex Action names are currently Japanese.

## Play now

Version **0.4.0** includes the centered board and unofficial Codex plugin. To try the current source:

```sh
git clone https://github.com/HirokiKobayashi-R/games.git
cd games/terminal-othello
node client.js --url https://terminal-othello.hiroki-c3a.workers.dev
```

Use a macOS / Linux terminal with **Node.js 22 or later**. Run these commands in an empty folder. No GitHub login, npm account, or client dependency installation is required.

```sh
curl -fL -o terminal-othello-source.tar.gz https://github.com/HirokiKobayashi-R/games/releases/download/v0.4.0/terminal-othello-source.tar.gz
curl -fL -o SHA256SUMS https://github.com/HirokiKobayashi-R/games/releases/download/v0.4.0/SHA256SUMS
shasum -a 256 -c SHA256SUMS --ignore-missing
tar -xzf terminal-othello-source.tar.gz
cd terminal-othello
node client.js --url https://terminal-othello.hiroki-c3a.workers.dev
```

Move with the arrow keys and Enter, or type a coordinate such as `d3` and press Enter. Quit with `q` or Ctrl-C. A second client connects in the same way and can be matched with you.

The [release](https://github.com/HirokiKobayashi-R/games/releases/tag/v0.4.0) also includes a local npm-installable tarball and checksums. **This package is not published to the npm registry.** The previous standalone v0.1.0 remains a separate, older release.

## Board appearance

Version 0.4 uses a quiet dark surface, round rasterized discs, two score cards, a mint turn indicator, and a distinct final-result view. Matching, offline recovery, legal moves and the selected square have separate visual cues. Stale match/error notices clear after an accepted move. The design stays entirely in the terminal.

**100 × 48** gives the largest board; **80 × 40** is the standard view. At 30 rows the board is smaller; short or low-color terminals use centered ●/○ text. The minimum is 40 × 22. Below it, moves are disabled while `q` and `m` remain available. Online play continues during resize.

The renderer uses ANSI 256-color or truecolor output and Unicode quadrant blocks, with 240 ms flips. No image protocol, browser, downloaded font, or extra runtime package is required. `NO_COLOR=1` switches to plain text and disables animation. If your terminal makes circles/block characters two columns wide, set `OTHELLO_STONE_WIDTH=2`. Fonts and character aspect ratios still affect appearance; real GUI rendering of this redesign has not been inspected.

```sh
OTHELLO_STONE_WIDTH=2 node client.js --url https://terminal-othello.hiroki-c3a.workers.dev
```

[Before / after](https://github.com/HirokiKobayashi-R/games/blob/main/docs/othello-redesign-comparison.png) · [100 × 48](https://github.com/HirokiKobayashi-R/games/blob/main/docs/othello-preview.png) · [80 × 40](https://github.com/HirokiKobayashi-R/games/blob/main/docs/othello-80x40.png) · [Result](https://github.com/HirokiKobayashi-R/games/blob/main/docs/othello-result.png). Images reconstruct actual PTY output from online QA using illustrative fonts; they are not GUI screenshots.

## Controls

| Action | Key |
| --- | --- |
| Select and place a disc | Arrow keys + Enter, or `d3` + Enter |
| Cancel / restart matchmaking | `m` |
| Resign from a human match | `m` during the match |
| Reset the CPU board | `n` |
| Find another opponent after a game | `r` |
| Quit; cancel waiting or resign | `q` / Ctrl-C |
| Clear coordinate input | Escape / Backspace |

**●** Black · **○** White. Small mint marks indicate legal moves (`+` in text mode); mint corners mark selection and a gold corner marks the last move. Recommended terminal size: **80 columns × 40 rows** or larger. If a player has no legal move, their turn passes automatically. When neither player can move, disc counts determine the winner or draw.

## Public API and limits

The existing public PoC runs on **Cloudflare Workers Free + SQLite Durable Objects**:

- API: https://terminal-othello.hiroki-c3a.workers.dev
- [Health check](https://terminal-othello.hiroki-c3a.workers.dev/health): `/health`
- `/` returns `Not Found`; there is no browser game. The client chooses the `/connect` WebSocket endpoint automatically.

Pass the base URL via `--url` or `OTHELLO_URL`. Without either, the client connects to `http://127.0.0.1:8787`. Public connections require HTTPS / WSS.

**Free does not mean unlimited.** The app is capped at **128 sessions** and is not designed for worldwide production scale or guaranteed availability. Cloudflare account quotas are shared with other apps. The documented Durable Objects Free allowances are 100,000 requests/day, 13,000 GB-s/day, 5,000,000 rows read/day, 100,000 rows written/day, and 5 GB total storage. Operations fail when applicable limits are exceeded; Workers has separate limits too. Check the latest [official pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) before deploying. Anonymous access also requires usage monitoring for abuse.

## Play from Codex

Install the [unofficial Othello plugin](PLUGIN.md) to launch a separate macOS Terminal from an explicitly selected skill:

```sh
codex plugin marketplace add HirokiKobayashi-R/games --ref main
codex plugin add terminal-othello@hiroki-games
```

Then use `/skills` in Codex CLI and select **Play Terminal Othello**. The [plugin guide](PLUGIN.md) covers desktop selection, updates, execution details, and verification limits. It requires no MCP or automatic hooks. The user confirmed plugin launch in v0.3.0. The unchanged launch path and redesigned client are covered by PTY tests; the maintainer has not operated the GUI.

### Existing project Actions (optional)

Clone the repository and open `games` (or an independent Othello checkout) as a **local Git project** in Codex:

```sh
git clone https://github.com/HirokiKobayashi-R/games.git
cd games/terminal-othello
```

Select **Terminal games** under Settings → Local environments if needed. The supplied macOS Actions are:

| Action name shown in Codex | Behavior |
| --- | --- |
| **オセロ** — Othello | Start an independent game in the integrated terminal; quit with `q`. No hook trust required. |
| **作業待ちオセロ** — Othello while waiting | Watch a local turn in this project. Resign and exit when it completes, requests approval, is interrupted, or its session ends. Requires reviewing and trusting six project hooks. |

See the [Codex setup guide](codex/README.md) for the exact hooks, privacy boundaries, and stop behavior. Nothing automatically changes global configuration or hook trust.

> **Verification boundary:** the launcher and automatic resignation were tested with synthetic lifecycle events. The actual Codex Actions UI and real callbacks after trust have **not** been verified. Work Cloud parent-task monitoring is unsupported.

## Disconnect and resume

Network interruptions reconnect automatically using the same random session secret. The server supplies the authoritative board, so the client does not replay an old move after reconnecting.

To resume after restarting the client process, use a session file from the start:

```sh
node client.js --url http://127.0.0.1:8787 --session alice.session.json
```

Use a different file for the other player, such as `bob.session.json`. Files are created with mode `0600` and excluded from Git. Do not share them: the secret authorizes resuming that session. A new connection using the same file replaces the previous one. Network reconnection within a running process works without a file.

- **2-minute grace period:** a disconnected opponent can return. After expiry, the online player wins; if both expire, the game is a draw. Disconnected players cannot receive new matches, and their waiting status expires after 2 minutes.
- **30 minutes without a move:** the game is a draw. Old sessions and unreferenced games are cleaned up.
- **Cancel versus match:** cancellation first removes the waiting player; matching first makes cancellation a resignation.
- `q`, Ctrl-C, and SIGTERM restore terminal modes, cursor, and the previous screen. SIGKILL or a forcibly closed terminal cannot run cleanup.

## Develop locally

From the source root, install the locked development dependencies and start the Worker:

```sh
npm ci
npm run dev
```

In two other terminals, run this from the same root:

```sh
node client.js --url http://127.0.0.1:8787
```

The client uses only Node built-ins. Wrangler is a pinned development dependency.

| File | Responsibility |
| --- | --- |
| [client.js](client.js) / [render.js](render.js) | Terminal input, rendering, and Node WebSocket client |
| [rules.js](rules.js) | Shared pure board rules; CPU runs only on the client |
| [arena.js](arena.js) | Matchmaking, cancellation, turn/revision checks, and reconnect deadlines |
| [worker.js](worker.js) | HTTP / WebSocket endpoints and durable SQLite state |
| [codex/](codex/) | Optional local Actions and lifecycle integration |

A single Durable Object serializes events and stores the queue and games together, saving the full state in one row before notifying clients. There is no sharding, account system, or ranking. Sessions are identified by a SHA-256 hash of a 256-bit secret. Neither identifiers nor secrets are sent to opponents; the secret travels in the WebSocket subprotocol, not the URL.

[WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) uses connection attachments and automatic 20-second ping/pong responses. Durable Object alarms handle deadlines without a continuously running server timer. Each connection is limited to 10 operations/second and messages of 512 characters.

### Build a local package

From the source root:

```sh
npm pack --pack-destination /tmp
```

In an empty directory:

```sh
npm install --no-audit --no-fund /tmp/terminal-othello-0.2.0.tgz
./node_modules/.bin/terminal-othello --url https://terminal-othello.hiroki-c3a.workers.dev
```

This installs a local tarball, not a registry package. No global installation is needed. The `bin` points to `client.js`; `package.json` explicitly lists included files. Source, server code, Codex configuration, and tests are included; credentials, logs, sessions, `.git`, `node_modules`, and `.wrangler` are excluded. npm tarballs omit `package-lock.json`; use the source archive and `npm ci` for locked development dependencies.

### Deploy your own Worker

[wrangler.jsonc](wrangler.jsonc) enables only workers.dev and SQLite `new_sqlite_classes`. It contains no account ID or custom domain.

1. Check your own Cloudflare account, existing authentication, Workers Free eligibility, and usage. Keep credentials outside the project.
2. Check the Worker name to avoid overwriting an existing deployment.
3. Authorize your deployment and run `npm run deploy`. The account owner must review any new login, permissions, or terms.
4. Check the returned URL's `/health`, run `npm run test:integration -- <URL>`, and connect two terminals.

No paid plan or custom domain is required by this configuration. This documentation update does not redeploy the existing server or change authentication.

## Verification

After `npm ci`, run from the source root:

```sh
npm test
npm run test:integration
npx wrangler deploy --dry-run --outdir dist
```

The integration test starts a temporary localhost Worker and SQLite store, then cleans them up. It covers illegal/wrong-turn/stale moves, matching, a full game with passes, cancellation races, four simultaneous clients, session replacement, reconnection, and board/queue recovery across Worker restarts.

For terminal smoke tests, start `npm run dev` separately, then run:

```sh
python3 test/terminal.py
```

PTY tests use the Python standard library on macOS / Linux. To target the public API:

```sh
python3 test/online-qa.py https://terminal-othello.hiroki-c3a.workers.dev
```

This uses two real PTY clients at a low rate. A test-only preload observes states and blocks outgoing moves until both clients confirm the same game ID. Unknown pairings abort. Other integration/lifecycle tests should use localhost. [v0.4.0 online QA report](https://github.com/HirokiKobayashi-R/games/blob/main/docs/othello-qa-v0.4.0.md).

**Verified:** unauthenticated release downloads and checksums; clean installation; 18 unit tests; public two-client play; CPU waiting, matching notification and a fresh board; cancellation and reconnection; terminal restoration; synthetic Codex events and resignation.

**User-confirmed:** v0.3.0 plugin launch. **Not verified by the maintainer:** real GUI appearance, Codex UI/callbacks, large-scale load, behavior at free-tier limits, actual hibernation duration/billing meters, or cross-platform runtime beyond the macOS test environment. SQLite restart recovery was tested locally; no production Worker restart was forced. Synthetic lifecycle tests do not register or trust hooks, or operate real Codex tasks.

## License and distribution

Distribution is through [GitHub Releases](https://github.com/HirokiKobayashi-R/games/releases). **No license has been selected or added.** A public repository does not itself grant an open-source license. `private: true` prevents npm registry publication; it does not prevent downloading from GitHub or installing a local tarball. No npm registry package has been published.
