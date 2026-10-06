<p align="center"><strong>English</strong> / <a href="README.ja.md">日本語</a></p>

[← Games](https://github.com/HirokiKobayashi-R/games)

# Terminal Dojo

**Bait. Evade. Punish.** An original offline CPU fighting game for the terminal. Python standard library only; no characters, images, or audio from existing games.

## Play

From this directory:

```sh
python3 dojo.py
```

On macOS you can also run `./Play.command`. Python 3.9+ and a curses-capable POSIX terminal are required; no extra packages. Recommended 80 × 24, minimum 64 × 22. Use Latin keyboard input. Finder double-click launch is not automatically verified.

Download `terminal-dojo-source.tar.gz` from [games v0.2.0](https://github.com/HirokiKobayashi-R/games/releases/tag/v0.2.0), verify it with the accompanying `SHA256SUMS`, extract it, and run the command above inside `terminal-dojo`. No API, registration, or network connection is used.

## Win your first round

1. Start with Enter and let the CPU approach.
2. When **CPU WINDUP 3→2→1** appears, tap **A** to retreat; use **W** to jump near a wall.
3. When the CPU misses and shows **OPEN!**, return with **D** and attack with **J**.
4. **PUNISH! -32** confirms a clean counter. Four successful counters win by KO.

The CPU commits to its windup position instead of tracking a backstep. If you move too close, one backstep may not clear its range; retreat early or jump. Mashing does not interrupt the CPU's windup. Normal attacks deal 8 damage versus the CPU's 22; guarding reduces received damage to 2 but does not create a whiff-counter bonus.

## Controls

| Key | Action |
| --- | --- |
| Enter / Space | Start |
| A / D, Left / Right | Short horizontal movement |
| W / Space / Up | Jump |
| J | Attack |
| K | Guard for 0.65 seconds; another press extends it |
| P / Escape | Pause |
| P / Enter | Resume while paused |
| R | Restart while paused or after the result; Enter also restarts after a result |
| V | Toggle DOT / ASCII rendering |
| Q / Ctrl-C / Ctrl-D | Quit anytime |
| Ctrl-Z | Pause without suspending the OS job |

100 HP, 25-second rounds. Zero HP is a KO; at timeout the higher HP wins. Equal HP or simultaneous KOs draw. Attack startup/recovery cannot be cancelled by movement or guard, and hits cause brief stun.

## Timing

| Event | Duration / damage |
| --- | --- |
| CPU windup | 0.48 seconds, stationary |
| CPU whiff opening | 0.95 seconds; one 32-damage punish |
| CPU recovery after hit/block | 0.55 seconds; no punish bonus |
| Player attack | 0.12-second startup + 0.38-second recovery |
| Hitstop on hit / block | 0.065 / 0.025 seconds |

Hitstop freezes fighters only; the round clock continues in real time. A whiff opening grants its bonus once.

## Rendering and terminal limits

Rendering targets 60 Hz. DOT mode uses 2 × 4 Braille subcells per character for half-column / quarter-row motion. At 80 columns and the same movement speed, measured output positions change 44 times/second versus 21 in ASCII; jumps have 17 heights versus 5. These are emitted-position counts, not physical display FPS measurements.

If Braille cannot be encoded or curses reports a width other than one column, the game falls back to ASCII. Press V if your font lacks glyphs or dots are hard to see. The game changes no fonts, apps, or security settings.

Terminals do not provide reliable key-release or simultaneous-key state. A movement press lasts 0.16 seconds and a guard press 0.65 seconds. Key repeat works but initial delays depend on the OS and terminal; start with short taps. There are no complex command moves.

## Pause and cleanup

Resize, undersized windows, or processing stalls over 0.5 seconds pause the round. Restore the size, then press P. Normal quit, Ctrl-C, SIGINT, SIGTERM, and SIGHUP restore terminal settings and the previous screen. SIGKILL or a terminal crash cannot run cleanup; use `reset` if needed. Non-TTY input and `TERM=dumb` are rejected with an explanation.

## Tests and scope

```sh
python3 -m unittest discover -s tests -v
```

`combat.py` handles time, collision, AI and results; `sprites.py` draws without mutating combat; `dojo.py` handles input, display and cleanup. Tests include a real 25-second round and take about a minute. Across 20 fixed random seeds, reacting after 120 ms to evade/counter wins while mashing loses.

PTY tests read telegraphs and press A/D/J to land four counters, and cover CPU victory, timeout, restart, resize, pause, signals and restoration. Persistent terminal flags, speeds and control characters are compared with their initial values, excluding macOS's transient PENDIN bit. The launcher test waits for startup instead of assuming a 150 ms launch.

Verified on macOS with Python 3.12 through PTYs, without Terminal GUI control. Real keyboard feel, physical display smoothness, other OS/terminal combinations and enjoyment require human playtesting. Dojo has no online play, Codex lifecycle hooks, saved data or runtime downloads. Its Codex Action only launches it independently.

No project license has been selected or added. Public source is not a license grant. No npm publication.
