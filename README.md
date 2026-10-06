<p align="center"><strong>English</strong> / <a href="README.ja.md">日本語</a></p>

<h1 align="center">Terminal Games</h1>
<p align="center">Small games. Real terminals. No browser gameplay.</p>

| Game | Play | Requirements |
| --- | --- | --- |
| [● Terminal Othello ○](terminal-othello/README.md) | Random online matches; local CPU practice while waiting | Node.js 22+, macOS / Linux terminal; minimum 40 × 22 |
| [Terminal Dojo](terminal-dojo/README.md) | Offline CPU fighting: bait, evade, punish | Python 3.9+, POSIX terminal with curses; minimum 64 × 22 |

Both games use standard runtime libraries. No player account or runtime package installation is needed. Their source, tests, and launch commands are independent. Othello messages and its Codex Action names are currently Japanese; Dojo uses English prompts. The documentation is bilingual.

## Get and play

```sh
git clone https://github.com/HirokiKobayashi-R/games.git
cd games
node terminal-othello/client.js --url https://terminal-othello.hiroki-c3a.workers.dev
```

For Dojo, from the `games` root:

```sh
python3 terminal-dojo/dojo.py
```

Othello starts searching immediately; play the CPU until an opponent arrives. Use arrows / coordinates + Enter; `q` quits. Dojo starts with Enter: move A/D, jump W, attack J, guard K, pause P, quit Q. See each game's guide for all controls.

Prefer downloads? [Release v0.2.0](https://github.com/HirokiKobayashi-R/games/releases/tag/v0.2.0) contains `terminal-othello-source.tar.gz`, `terminal-dojo-source.tar.gz`, a local npm tarball for Othello, and `SHA256SUMS`. Extract only the game you want, then run `node client.js --url https://terminal-othello.hiroki-c3a.workers.dev` or `python3 dojo.py` inside its directory. GitHub authentication is not required. Neither game is published to the npm registry.

## Othello preview

![Othello terminal board](docs/othello-preview.png)

Actual online-QA PTY output reconstructed with illustrative fonts, not a GUI screenshot. The new design uses a quiet dark board, round rasterized discs, score cards, a mint turn indicator and distinct result screens. Use **100 × 48** for the largest view or **80 × 40** for the standard view. 256-color/truecolor output adapts to the terminal; `NO_COLOR=1` gives a plain-text fallback. [Before / after](docs/othello-redesign-comparison.png) · [Standard size](docs/othello-80x40.png) · [Result](docs/othello-result.png) · [Online QA](docs/othello-qa-v0.4.0.md).

## Unofficial Codex plugin

Othello **v0.4.0** is available as a community plugin from this GitHub catalog. The skill launches a separate **macOS Terminal**, so the game can stay open while you continue using Codex. It uses Node.js 22+ and has no MCP or automatic hooks.

```sh
codex plugin marketplace add HirokiKobayashi-R/games --ref main
codex plugin add terminal-othello@hiroki-games
```

In Codex CLI, open `/skills` and select **Play Terminal Othello**. [Install, update, and execution details](terminal-othello/PLUGIN.md) · [Download v0.4.0](https://github.com/HirokiKobayashi-R/games/releases/tag/v0.4.0). This is not a listing in OpenAI's universal plugin directory. The user confirmed v0.3.0 plugin launch. The same launcher and redesigned client pass CLI/PTY checks; this redesign has not been visually inspected in the real GUI.

## Existing Codex project Actions

Open this repository as a local Codex project and use the supplied **Terminal games** environment. The macOS Actions launch Othello, monitored Othello, or Dojo. Monitored Othello requires reviewing and trusting six project hooks and resigns when work completes, needs approval, is interrupted, or ends. [English setup](terminal-othello/codex/README.md) · [日本語](terminal-othello/codex/README.ja.md).

Actual Codex Actions UI and real callbacks remain unverified; synthetic-event PTY tests cover resignation and restoration. Work Cloud parent-task monitoring is unsupported. No global configuration or trust setting is automatically changed. Dojo has no lifecycle integration.

## Public API and scope

Only Othello uses the existing public API. It runs on Cloudflare Workers Free + SQLite Durable Objects via workers.dev. **Free is limited**, and this PoC caps admission at **128 sessions**. Account quotas are shared; exceeding free-tier limits can stop requests. See [Othello limits](terminal-othello/README.md#public-api-and-limits) and [Cloudflare pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/). No large-scale availability guarantee. Dojo is offline and consumes no API quota. No server redeployment is needed for this collection.

Each game documents its tests. macOS PTY verification covers operation, resize, results, and terminal restoration; other OS/font combinations and real keyboard feel need user testing. The game directories can be extracted and used independently. The root `.codex` definitions support the collection; Othello also carries standalone definitions. Repeated hook events do not restart a stopped turn.

## License and migration

No project license has been selected or added. Public source is not an open-source license grant. Othello retains `private: true` to prevent npm registry publication; local tarball installation works.

This repository is the new home for Terminal Othello and Terminal Dojo. Older standalone Othello releases are separate snapshots. Use this repository and its releases for the current versions.
