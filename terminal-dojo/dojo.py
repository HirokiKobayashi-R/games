#!/usr/bin/env python3
"""Terminal Dojo: an original, dependency-free terminal fighting game."""

import curses
import math
import os
import select
import signal
import sys
import termios
import time

from combat import Match, ARENA, JUMP_TIME, CPU_WINDUP
from sprites import fighter_cells

MIN_COLS, MIN_ROWS = 64, 22
FRAME = 1 / 60


class ExitGame(Exception):
    pass


def interrupted(signum, frame):
    raise ExitGame


def put(screen, row, col, text, style=0):
    height, width = screen.getmaxyx()
    if row < 0 or row >= height or col >= width - 1:
        return
    if col < 0:
        text, col = text[-col:], 0
    try:
        screen.addnstr(row, col, text, width - col - 1, style)
    except curses.error:
        # A resize may arrive between getmaxyx and addnstr.
        pass


def centered(screen, row, text, style=0):
    put(screen, row, (screen.getmaxyx()[1] - len(text)) // 2, text, style)


def fighter_state(fighter):
    if fighter.stun > 0:
        return "HIT"
    if fighter.phase == "windup":
        return "WINDUP!"
    if fighter.phase == "recover":
        return "OPEN!" if fighter.open else "RECOVER"
    if fighter.guard > 0:
        return "GUARD"
    if fighter.jump > 0:
        return "JUMP"
    return "READY"


def draw(screen, match, mode, subcells=True):
    screen.erase()
    rows, cols = screen.getmaxyx()
    if cols < MIN_COLS or rows < MIN_ROWS:
        if cols < 30 or rows < 6:
            put(screen, 0, 0, "Q: quit")
            put(screen, 1, 0, "Resize")
            put(screen, 2, 0, "64x22")
            screen.refresh()
            return
        centered(screen, max(0, rows // 2 - 2), "TERMINAL TOO SMALL", curses.A_BOLD)
        centered(screen, max(1, rows // 2 - 1), "Need 64 x 22; now %d x %d" % (cols, rows))
        instruction = "Resize, then ENTER to start." if mode == "ready" else "Round frozen. Resize, then P."
        centered(screen, max(2, rows // 2), instruction)
        centered(screen, max(3, rows // 2 + 1), "Q / Ctrl-C: quit")
        screen.refresh()
        return
    # Fixed-height, centered arena. Large windows add breathing room, not reach.
    width = min(94, cols - 4)
    left = (cols - width) // 2
    top = max(0, (rows - 22) // 2)
    centered(screen, top, "TERMINAL DOJO", curses.A_BOLD)
    player, cpu = match.player, match.cpu
    cells = min(20, (width - 24) // 2)
    bar = lambda hp: "#" * math.ceil(hp * cells / 100) + "." * (cells - math.ceil(hp * cells / 100))
    put(screen, top + 2, left, "YOU [%s] %3d" % (bar(player.hp), player.hp), curses.color_pair(1))
    put(screen, top + 2, left + width - cells - 10, "CPU [%s] %3d" % (bar(cpu.hp), cpu.hp), curses.color_pair(2))
    centered(screen, top + 3, "%02ds   |   %s" % (math.ceil(match.remaining), mode.upper()), curses.A_BOLD)
    put(screen, top + 4, left, "YOU: " + fighter_state(player), curses.color_pair(1))
    put(screen, top + 4, left + width - 14, "CPU: " + fighter_state(cpu), curses.color_pair(2))
    put(screen, top + 5, left, "+" + "-" * (width - 2) + "+")
    for row in range(top + 6, top + 15):
        put(screen, row, left, "|")
        put(screen, row, left + width - 1, "|")
    put(screen, top + 15, left, "+" + "=" * (width - 2) + "+")
    if subcells:
        draw_subcells(screen, match, width, left, top)
    else:
        # World units have the same physical reach on every terminal size.
        for fighter, facing, label, color in ((player, 1, "YOU", 1), (cpu, -1, "CPU", 2)):
            x = left + 2 + round(fighter.x / ARENA * (width - 5))
            elevation = round(4 * math.sin(math.pi * fighter.jump / JUMP_TIME))
            y = top + 12 - elevation
            pose = [" O ", "/|\\", "/ \\"]
            if fighter.guard > 0:
                pose[1] = " |]" if facing == 1 else "[| "
            elif fighter.phase != "ready":
                pose[1] = " |->" if facing == 1 else "<-| "
                if fighter.phase == "windup":
                    pose[0] = " ! "
            style = curses.color_pair(color) | curses.A_BOLD
            if fighter.flash > 0:
                style |= curses.A_REVERSE
            put(screen, y - 2, x - 1, label, style)
            for i, line in enumerate(pose):
                put(screen, y + i, x - (1 if facing == 1 else 2), line, style)
    if match.impact_time > 0 and match.impact:
        position, punish = match.impact
        x = left + 2 + round(position / ARENA * (width-5))
        put(screen, top+12, x-1, "*X*" if punish else " * ", curses.A_BOLD)
    if mode == "ready":
        centered(screen, top + 7, "ENTER / SPACE: FIGHT", curses.A_REVERSE | curses.A_BOLD)
        centered(screen, top + 8, "BAIT > STEP BACK > PUNISH")
        centered(screen, top + 9, "CPU shrugs off early hits. Attack the OPEN recovery.")
    elif mode == "paused":
        centered(screen, top + 7, "PAUSED - P / ENTER: RESUME", curses.A_REVERSE | curses.A_BOLD)
        centered(screen, top + 8, "R: restart     Q: quit")
    elif mode == "result":
        centered(screen, top + 7, match.result, curses.A_REVERSE | curses.A_BOLD)
        centered(screen, top + 8, "R / ENTER: REMATCH     Q: quit")
        centered(screen, top + 9, f"Clean punishes: {match.punishes}")
    elif cpu.phase == "windup":
        countdown = max(1, math.ceil(cpu.timer / CPU_WINDUP * 3))
        centered(screen, top+7, f"CPU WINDUP {countdown}  << STEP BACK / JUMP", curses.A_BOLD)
    elif cpu.open:
        centered(screen, top+7, "OPEN!  >> CLOSE IN + J", curses.A_REVERSE | curses.A_BOLD)
    notice = match.message if match.message_time > 0 else "Bait WINDUP, step back with A, then D + J on OPEN."
    centered(screen, top + 16, notice)
    centered(screen, top + 18, "A/D or arrows: step   W/SPACE/UP: jump   J: attack")
    centered(screen, top + 19, "K: guard 0.65s   P/ESC: pause   Q/Ctrl-C: quit")
    renderer = "DOT 2x4" if subcells else "ASCII"
    centered(screen, top + 21, f"V: view [{renderer}]   Tap keys; repeat works.", curses.A_DIM)
    screen.refresh()



def draw_subcells(screen, match, width, left, top):
    cells = {}
    for fighter, facing, color in ((match.player, 1, 1), (match.cpu, -1, 2)):
        style = curses.color_pair(color) | curses.A_BOLD
        if fighter.flash > 0:
            style |= curses.A_REVERSE
        for key, mask in fighter_cells(fighter, width, left, top, facing, color == 2).items():
            if key in cells:
                previous, previous_style = cells[key]
                # Two fighters can share a cell. Preserve both dot masks.
                if bin(previous).count("1") >= bin(mask).count("1"):
                    style_here = previous_style
                else:
                    style_here = style
                cells[key] = previous | mask, style_here
            else:
                cells[key] = mask, style
    for (row, col), (mask, style) in sorted(cells.items()):
        put(screen, row, col, chr(0x2800 + mask), style)


def supports_subcells(screen):
    # Checks curses' character width/encoding, not the installed font's artwork.
    try:
        "⣿".encode(sys.stdout.encoding or "ascii")
        screen.addstr(0, 0, "⣿")
        supported = screen.getyx() == (0, 1)
    except (UnicodeError, curses.error):
        supported = False
    screen.erase()
    return supported

def run(screen):
    # ncurses installs its own handlers during initialization; replace them here.
    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(sig, interrupted)
    curses.raw()  # Ctrl-C is handled below; Ctrl-Z pauses instead of stranding a raw tty.
    screen.keypad(True)
    screen.nodelay(True)
    curses.set_escdelay(25)
    try:
        curses.curs_set(0)
    except curses.error:
        pass
    if curses.has_colors():
        curses.start_color()
        curses.use_default_colors()
        curses.init_pair(1, curses.COLOR_CYAN, -1)
        curses.init_pair(2, curses.COLOR_YELLOW, -1)
    subcells_available = supports_subcells(screen)
    subcells = subcells_available
    match = Match()
    mode = "ready"
    previous = time.monotonic()
    next_frame = previous
    redraw = True
    old_size = screen.getmaxyx()
    commands = {ord("a"): "left", curses.KEY_LEFT: "left", ord("d"): "right",
                curses.KEY_RIGHT: "right", ord("w"): "jump", ord(" "): "jump",
                curses.KEY_UP: "jump", ord("j"): "attack", ord("k"): "guard"}
    while True:
        frame_start = time.monotonic()
        elapsed = frame_start - previous
        previous = frame_start
        size = screen.getmaxyx()
        small = size[0] < MIN_ROWS or size[1] < MIN_COLS
        if size != old_size or small or elapsed > 0.5:
            if mode == "fight":
                mode = "paused"
                match.clear_motion()
                redraw = True
            if size != old_size:
                # Keep queued Q/Ctrl-C: a resize must never swallow an exit key.
                redraw = True
            old_size = size
        # Advance only elapsed real time, before applying newly arrived input.
        # Input events may wake this loop between the independent 60Hz frames.
        if mode == "fight":
            match.update(min(elapsed, 0.1))
            if match.result:
                mode = "result"
                curses.flushinp()
                redraw = True
        for _ in range(64):
            key = screen.getch()
            if key == -1:
                break
            if key in (ord("q"), ord("Q"), 3, 4):
                return
            if key == curses.KEY_RESIZE:
                redraw = True
                if mode == "fight":
                    mode = "paused"
                    match.clear_motion()
                break
            if small:
                continue
            if ord("A") <= key <= ord("Z"):
                key += 32
            if key == ord("v"):
                if subcells_available:
                    subcells = not subcells
                    redraw = True
                continue
            changed = False
            if mode == "ready" and key in (10, 13, ord(" ")):
                mode, changed = "fight", True
            elif mode == "fight" and key in (ord("p"), 27, 26):
                mode, changed = "paused", True
                match.clear_motion()
            elif mode == "paused" and key in (ord("p"), 10, 13):
                mode, changed = "fight", True
            elif mode in ("paused", "result") and key in (ord("r"), 10, 13):
                match, mode, changed = Match(), "fight", True
            elif mode == "fight":
                action = commands.get(key)
                if action:
                    match.command(match.player, action)
            if changed:
                # Do not let repeats cross a modal transition.
                curses.flushinp()
                redraw = True
                break
        now = time.monotonic()
        if redraw or (mode == "fight" and now >= next_frame):
            draw(screen, match, mode, subcells)
            redraw = False
            # Advance the deadline, not "now + FRAME": OS wake-up overshoot
            # must not accumulate. Skip missed frames instead of drawing bursts.
            next_frame += max(1, math.floor((now - next_frame) / FRAME) + 1) * FRAME
        # Wait without spinning; input wakes immediately. In a static screen,
        # the bounded wait also picks up curses' signal-generated KEY_RESIZE.
        timeout = max(0, next_frame - time.monotonic()) if mode == "fight" else 0.1
        select.select([sys.stdin], [], [], timeout)


def main():
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        print("Terminal Dojo needs an interactive terminal. Run: python3 dojo.py", file=sys.stderr)
        return 1
    if os.environ.get("TERM", "dumb") in ("", "dumb"):
        print("Use a terminal with TERM set (e.g. macOS Terminal).", file=sys.stderr)
        return 1
    handlers = {sig: signal.getsignal(sig) for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP)}
    terminal_settings = termios.tcgetattr(sys.stdin.fileno())
    try:
        for sig in handlers:
            signal.signal(sig, interrupted)
        curses.wrapper(run)
    except (ExitGame, KeyboardInterrupt):
        pass
    except curses.error as exc:
        print("Terminal unavailable: %s" % exc, file=sys.stderr)
        return 1
    finally:
        # Restore entry settings even if initialization or rendering raised.
        try:
            termios.tcsetattr(sys.stdin.fileno(), termios.TCSANOW, terminal_settings)
        except termios.error:
            pass  # A disconnected terminal can no longer accept settings.
        for sig, handler in handlers.items():
            signal.signal(sig, handler)
    print("Terminal Dojo closed. Thanks for playing!")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
