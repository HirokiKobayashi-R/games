---
name: othello
description: Launch Terminal Othello in a separate interactive macOS Terminal when explicitly asked to play Othello. Random online matchmaking runs while the user practices against a local CPU. Requires local macOS and Node.js 22+. Do not use for coding tasks, browser games, or automatic background launches.
---

1. Locate this installed SKILL.md. The plugin root is two directories above its containing directory. Resolve the script from that location, never from the user's current project or a guessed cache path.
2. Explain briefly that the launcher opens macOS Terminal and starts a game connecting to `https://terminal-othello.hiroki-c3a.workers.dev`; waiting players practice against the local CPU. No login is needed. The launcher creates temporary files and a local singleton lock, and does not read Codex sessions, install dependencies, register hooks, or change Codex settings.
3. Run `sh "<absolute plugin root>/scripts/othello.sh"` using the host's normal shell execution tool. Quote the resolved path. Do not run the interactive client in an agent-owned PTY or keep the turn waiting for gameplay. Do not send game keystrokes on the user's behalf.
4. Honor the host's sandbox and approval policy. If opening Terminal is denied, stop that attempt; do not try AppleScript, UI automation, another launcher, or a privilege bypass. Show the manual command below for the user to run themselves. For non-macOS or non-local environments, explain that this launcher is unavailable.
5. Report the launcher's actual result. “Started” means its terminal runner started, not that you visually inspected a window. If already running, direct the user to the existing game. On an error, show the concise error and the manual command; do not install or upgrade Node automatically.
6. Give the controls: arrows or `d3` + Enter to move, `m` to cancel/resume matching, `q` to quit. Recommend 100 columns × 48 rows for the largest board, or 80 × 40 for the standard view. For two-column circle/block glyphs the user can set `OTHELLO_STONE_WIDTH=2`; `NO_COLOR=1` disables colors and flips. Finish the launch turn promptly so Codex can continue other work. This skill does not monitor or stop Codex tasks.

Manual fallback, to be run by the user in their own interactive terminal (substitute the resolved path):

```sh
node "<absolute plugin root>/client.js" --url https://terminal-othello.hiroki-c3a.workers.dev
```

The game handles terminal restoration, cancellation and reconnection. Cloudflare's free tier has limits; this PoC may be unavailable when its quotas or admission limit are reached. The default launcher supports macOS only; Windows/Linux terminal launchers are not bundled.
