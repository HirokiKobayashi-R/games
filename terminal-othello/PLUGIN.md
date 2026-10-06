<p align="center"><strong>English</strong> / <a href="PLUGIN.ja.md">日本語</a></p>

# Terminal Othello — unofficial Codex plugin

Open Othello in a **separate macOS Terminal** from an explicitly selected skill. Play a local CPU while random matchmaking waits; a human match starts on a fresh board. Codex's launch turn finishes while the game runs independently. This plugin does not monitor Codex tasks.

**v0.4.0** redesigns the board, round discs, score cards, turn/status indicators and results. This is a GitHub-distributed community plugin, not an OpenAI-endorsed plugin or a listing in the universal Plugins Directory. No project license has been selected; public availability is not an open-source license grant.

## Install

Requirements: local **macOS**, Terminal.app, **Node.js 22+** on the Codex process's PATH, Git, and a Codex CLI with `plugin` commands. CLI **0.153.2** was used for catalog validation. Do not install runtimes automatically; check `node --version` and `codex plugin --help` first.

Run these commands yourself in a terminal. They register the source and install the plugin in your Codex user settings:

```sh
codex plugin marketplace add HirokiKobayashi-R/games --ref main
codex plugin add terminal-othello@hiroki-games
```

Restart Codex if the skill has not appeared. In **Codex CLI**, open `/skills` and select **Play Terminal Othello** (skill `othello`). Use the selector's offered `$` mention if preferred. In the **desktop app**, type `@` and select the Othello skill when it is available. No custom `/othello` command is registered. Surface availability varies; the desktop installation/selection UI has not been exercised here.

The skill runs the installed `scripts/othello.sh`. It checks Node/macOS, starts a small detached supervisor under macOS `lockf`, and asks `/usr/bin/open -a Terminal` to open a temporary `.command` file. The terminal runner launches the bundled client with the same absolute Node executable. Normal host approval rules still apply; a denied Terminal launch must not be bypassed. The skill gives a manual command instead.

Use **100 × 48** for the largest board or **80 × 40** for the standard view. Arrow keys or `d3` + Enter place a disc; `m` cancels/resumes matching; `q` quits. `OTHELLO_STONE_WIDTH=2` accommodates two-column circle/block glyphs, and `NO_COLOR=1` disables colors and flip animation. Set these in the launcher's environment or ask the skill to pass them for this invocation. Game messages are currently Japanese.

## Update or remove

Quit the game before updating. Refresh only this catalog, then reinstall its current snapshot:

```sh
codex plugin marketplace upgrade hiroki-games
codex plugin remove terminal-othello@hiroki-games
codex plugin add terminal-othello@hiroki-games
```

Restart Codex to reload skills. To uninstall instead:

```sh
codex plugin remove terminal-othello@hiroki-games
codex plugin marketplace remove hiroki-games
```

For a pinned release, use `--ref v0.4.0` instead of `--ref main` when adding the source. A pinned tag does not move to newer releases when refreshed; remove the marketplace and re-add it with the desired tag to change versions.

## Downloaded catalog / manual launch

[Release v0.4.0](https://github.com/HirokiKobayashi-R/games/releases/tag/v0.4.0) includes `terminal-othello-plugin.tar.gz` and `SHA256SUMS`. The plugin archive contains the catalog and client/skill/launcher files, without server development dependencies or legacy project hooks. Verify and extract it in an empty directory:

```sh
curl -fL -o terminal-othello-plugin.tar.gz https://github.com/HirokiKobayashi-R/games/releases/download/v0.4.0/terminal-othello-plugin.tar.gz
curl -fL -o SHA256SUMS https://github.com/HirokiKobayashi-R/games/releases/download/v0.4.0/SHA256SUMS
shasum -a 256 -c SHA256SUMS --ignore-missing
tar -xzf terminal-othello-plugin.tar.gz
codex plugin marketplace add ./terminal-othello-plugin
codex plugin add terminal-othello@hiroki-games
```

Use one source named `hiroki-games` at a time. Remove the existing catalog before switching between Git and extracted sources. Keep an extracted source directory in place while it is configured; replacing it and reinstalling refreshes a local source. Git marketplace upgrade applies to Git sources.

To run the downloaded game yourself without installing a plugin:

```sh
node terminal-othello-plugin/terminal-othello/client.js --url https://terminal-othello.hiroki-c3a.workers.dev
```

## Execution, permissions and limits

- No MCP, OAuth, API token, npm registry installation, global config editing by the launcher, or automatic hooks. Installing the plugin is an explicit Codex operation. Legacy `.codex` Action/hook files in the Git source are not declared as plugin hooks and are not invoked by this skill.
- Local writes are limited to a private `/tmp/terminal-othello-<uid>/` directory: per-launch command/settings/status files, a Unix control socket, and one lock file. Finished requests are removed; the empty lock inode stays for race-safe reuse. Abruptly killed processes may leave temporary request files; OS locks are released when their holders exit. No Codex sessions or project files are read.
- One plugin-launched game per OS user. Repeated requests while opening or playing return “already running.” Direct/manual client launches are separate. The runner waits at most 10 seconds for Terminal startup; a late or failed request cannot start a game after its control socket closes. An OS-open failure is reported without retrying through another GUI mechanism.
- Only gameplay messages and a random ephemeral reconnect token go to `https://terminal-othello.hiroki-c3a.workers.dev`. CPU play is local. No Codex conversation is sent. `OTHELLO_URL` can override the game server. Cloudflare Free quotas and the 128-session PoC admission limit apply; service is not unlimited or guaranteed.
- The plugin's automatic terminal launcher is **macOS only**. Linux/Windows GUI launch and browser/cloud-only execution are unsupported. The standalone POSIX client remains available independently.

## Verification and known gaps

Verified on macOS: portable manifest/catalog recognized as v0.4.0 by Codex CLI 0.153.2 using command-only configuration; package contents and schema; Node checks; paths with spaces, apostrophes and shell metacharacters; concurrent requests; opener failure/timeout; CPU moves; `q`, SIGINT and SIGTERM cleanup; PTY mode, cursor and alternate-screen restoration. Existing game rules, matching, pass/end, reconnection and rendering tests remain in the source tree.

The GUI opener is replaced in automated tests; **the user confirmed v0.3.0 plugin launch**. The same launch path is retained. The maintainer has not operated the desktop UI or inspected the redesigned game in a real Terminal window. No user Codex settings, trust decisions or sessions were changed for testing. The launcher reports runner startup, not visual inspection of the window. Read-only catalog validation is not an installation test.

Source checkout checks:

```sh
cd terminal-othello
npm test
python3 test/plugin-terminal.py
python3 test/visual.py
```

The Python tests need macOS/Python 3; gameplay needs only Node. Packaging uses Python's standard library; no new runtime dependencies were added.

Specification references: [OpenAI plugin packaging and marketplaces](https://developers.openai.com/plugins/build/plugins), [skill invocation](https://learn.chatgpt.com/docs/build-skills). CLI install/remove syntax was also checked against the local `codex plugin --help` commands.
