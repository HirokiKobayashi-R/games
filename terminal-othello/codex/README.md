<p align="center"><strong>English</strong> &nbsp; / &nbsp; <a href="README.ja.md">日本語</a></p>

[← Game README](../README.md)

# Play from Codex

This repository provides **Actions** to launch the terminal game and an optional local integration that stops it when a task's state changes. No plugin installation is required. Independent play and monitored play are separate actions.

This path detection supports both the `games` repository and a standalone Othello checkout. In `games`, the root `.codex` configuration adds Terminal Dojo as an independent action; Dojo itself has no lifecycle hooks. Monitored Othello watches tasks in the same Git project. Repeated events for the same turn do not restart it.

## Launch actions

1. Select **Codex** in the desktop app and open this project's root—the folder containing `package.json` and `.codex`—as a local Git project.
2. If needed, select **Terminal games** under Settings → Local environments. The definition is [`.codex/environments/environment.toml`](../.codex/environments/environment.toml).
3. Choose **オセロ** or **作業待ちオセロ** from the top Actions menu. These are the actual Japanese labels in the configuration.

| Action | Behavior |
| --- | --- |
| **オセロ** — Othello | Connect to the public server in the integrated terminal. Independent of Codex progress; quit with `q`. Hook trust is not required. |
| **作業待ちオセロ** — Othello while waiting | Watch a running local Codex turn in the same project. Resign and exit on approval requests, completion, interruption, or session end. Requires reviewing and trusting the hooks. |

Node.js 22 or later must be on the app terminal's PATH. No additional package is needed. The supplied Actions use `platform = "darwin"` and are for macOS.

Actions are project-specific. These files do not add buttons to other projects or to all of Work Cloud, and do not inject input into an existing terminal or Codex conversation.

## Review before enabling monitored play

[`.codex/hooks.json`](../.codex/hooks.json) contains **six project hooks**. Global `~/.codex/hooks.json`, `~/.codex/config.toml`, and hook trust settings are not modified by this integration.

All six run this local command synchronously with a 3-second timeout:

```sh
root="$(git rev-parse --show-toplevel)"; if [ -d "$root/terminal-othello/codex" ]; then root="$root/terminal-othello"; fi; node "$root/codex/hook.js"
```

| Hook | State recorded for the game |
| --- | --- |
| `UserPromptSubmit` | Work has started. Does not open the game automatically. |
| `PermissionRequest` | Approval is needed. Stop the game so the user can handle normal Codex approval. Never grant or deny approval. |
| `PostToolUse` | Refresh the last-seen time only while work is running. Does not imply that approval was granted. |
| `Stop` | Work completed. Stop the game. |
| `Interrupt` | Work interrupted. Stop the game. |
| `SessionEnd` | Session ended. Stop the game. Merely switching tabs does not fire this event. |

Under the documented hook trust model, non-managed hooks do not run until the user **reviews and trusts their exact definitions**. Review this project's definitions in the CLI's `/hooks` interface and trust only these hooks. Do not bulk-trust or disable unrelated hooks. Do not bypass trust checks.

After enabling them, start a local Codex task in this project, then press **作業待ちオセロ**. If one turn is working, it is selected. If several are working, choose by the numbered anonymous ID and last-update time. If no eligible turn exists, the launcher refuses to start; it does not silently launch an unmonitored game.

After an approval request, `PostToolUse` does not restart the game. Start a new turn with user input, then press the Action again. Completion and interruption do not automatically restart it either.

## How stopping works

The monitored launcher manages only the game process it started. On a state change it sends SIGTERM; the client sends `cancel`, waits for an acknowledgement, and restores the cursor, terminal mode, and previous screen. In a human match, the opponent wins by resignation. During CPU practice or matchmaking, searching stops. If the connection itself is down and cancellation cannot be delivered, the server's existing 2-minute disconnection grace period applies.

Events for other sessions or stale turns do not end the chosen turn's game. If the selected session advances to another turn, the game stops. Missing or invalid state, or **5 minutes without an update**, also stops play. This conservative limit applies even to a long thinking or tool-execution phase.

The launcher returns control to the original terminal in Codex. It does not click approval buttons, force app focus, or type into a running Codex session.

## Privacy and scope

- Hook stdin is processed locally. Prompts, source code, `tool_input`, `tool_response`, and transcripts are not stored. Transcript files are never opened.
- State is a small `0600` JSON file in a user-owned `0700` directory under the OS temporary directory. It contains only status, update time, SHA-256 hashes of session/turn IDs, and a format version. The project path is also hashed rather than stored as text.
- Hooks make no network calls. The game API receives only the game's normal protocol traffic, such as joining, moves, and cancellation. Codex status and identifiers are not transmitted.
- Hooks always return `{}`. They do not change approvals, safety settings, the model, or turn-continuation decisions.
- No global hooks, plugins, new permissions, or authentication are automatically installed or configured.

To extend this to another repository, review that project's corresponding Actions and hooks separately. Global registration requires merging with existing definitions and separate user approval; this integration does not perform it.

## Support and verification

**Verified:** narrow/wide circle rendering, concurrent events, late heartbeat after completion, ignoring stale turns, minimal stored data and file permissions, and synthetic lifecycle input through the actual hook/launcher/client into two PTY clients—including resignation, the opponent's win, and terminal restoration.

**Not verified:** the actual Codex Actions buttons and clicks, or real Codex callbacks after the user trusts the hooks. Synthetic event tests are not evidence that installed hooks have fired in Codex.

**Unsupported:** detecting Work Cloud or cloud-orchestrator parent-task state through local hooks. Delegating tools to a local environment does not remove this restriction. Local command hooks for that personal cloud-parent workflow are not supported by the documented model; simply installing a plugin does not resolve it.

From the project root:

```sh
npm test
python3 test/codex-terminal.py https://terminal-othello.hiroki-c3a.workers.dev
```

These tests generate synthetic lifecycle input. They do not register or trust hooks, or operate Codex tasks. The PTY test makes real public-server matches; run it when other users are not playing.

Official references: [Actions / local environments](https://developers.openai.com/codex/app/local-environments), [Hooks](https://learn.chatgpt.com/docs/hooks), [Plugin hooks](https://developers.openai.com/plugins/build/plugins#bundled-mcp-servers-and-lifecycle-hooks).
