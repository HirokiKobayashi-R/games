"""Real POSIX PTYs: input, signals, resize, and tty restoration."""

import fcntl
import os
from pathlib import Path
import pty
import select
import signal
import struct
import subprocess
import sys
import termios
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


class Terminal:
    def __init__(self, rows=24, cols=80, launcher=False):
        self.master, self.slave = pty.openpty()
        self.resize(rows, cols)
        self.original = termios.tcgetattr(self.slave)
        command = [str(ROOT / "Play.command")] if launcher else [sys.executable, str(ROOT / "dojo.py")]
        self.process = subprocess.Popen(command, stdin=self.slave, stdout=self.slave, stderr=self.slave,
                                        env={**os.environ, "TERM": "xterm-256color"}, start_new_session=True)
        self.output = b""
        deadline = time.monotonic() + 3
        while b"TERMINAL" not in self.output and self.process.poll() is None and time.monotonic() < deadline:
            self.read(0.05)

    def resize(self, rows, cols):
        fcntl.ioctl(self.slave, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
        if hasattr(self, "process"):
            self.process.send_signal(signal.SIGWINCH)

    def read(self, seconds=0.1):
        end = time.monotonic() + seconds
        data = b""
        while time.monotonic() < end:
            readable, _, _ = select.select([self.master], [], [], max(0, end - time.monotonic()))
            if readable:
                data += os.read(self.master, 65536)
        self.output += data
        return data

    def key(self, data, seconds=0.1):
        os.write(self.master, data)
        return self.read(seconds)

    def finish(self, key=b"q", sig=None):
        if sig:
            self.process.send_signal(sig)
        else:
            self.key(key)
        # A PTY has a finite output queue; drain while ncurses restores it.
        deadline = time.monotonic() + 3
        while self.process.poll() is None and time.monotonic() < deadline:
            self.read(0.05)
        self.process.wait(timeout=3)
        self.read(0.05)
        restored = termios.tcgetattr(self.slave)
        # Darwin sets this transient kernel state on ANY raw -> canonical switch,
        # even plain tty.setraw()/tcsetattr(), with no curses involved.
        # All persistent flags, speeds and control characters must match exactly.
        restored[3] &= ~termios.PENDIN
        self.original[3] &= ~termios.PENDIN
        return restored

    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=3)
        os.close(self.master)
        os.close(self.slave)


class PTYTests(unittest.TestCase):
    def terminal(self, **kwargs):
        terminal = Terminal(**kwargs)
        self.addCleanup(terminal.close)
        self.assertIsNone(terminal.process.poll(), terminal.output)
        return terminal

    def test_play_pause_resume_attack_guard_jump_restart_and_quit(self):
        t = self.terminal(launcher=True)
        self.assertIn(b"TERMINAL DOJO", t.output)
        t.key(b"\r")
        t.key(b"d", 0.18)
        t.key(b"k", 0.1)
        self.assertIn(b"GUARD", t.output)
        t.key(b"w", 0.1)
        self.assertIn(b"JUMP", t.output)
        t.read(0.7)
        t.key(b"j", 0.05)
        self.assertIn(b"WINDUP", t.output)
        t.key(b"p")
        self.assertIn(b"PAUSED", t.output)
        frozen = t.read(0.5)
        self.assertEqual(frozen, b"")
        resumed = t.key(b"p")
        self.assertIn(b"FIGHT", resumed)
        t.key(b"\x1b", 0.15)
        self.assertIn(b"PAUSED", t.output)
        t.key(b"r")
        self.assertEqual(t.finish(), t.original)
        self.assertEqual(t.process.returncode, 0)
        self.assertIn(b"\x1b[?1049l", t.output)  # Leaves alternate screen.
        self.assertIn(b"\x1b[?25h", t.output)  # Restores visible cursor.

    def test_small_terminal_resize_and_control_c(self):
        t = self.terminal(rows=10, cols=40)
        self.assertIn(b"TERMINAL TOO SMALL", t.output)
        t.key(b"\r")
        t.resize(24, 80)
        t.read(0.15)
        t.key(b"\r")
        t.resize(22, 64)
        t.read(0.15)
        self.assertIn(b"PAUSED", t.output)
        t.resize(3, 8)
        t.read(0.1)
        self.assertIsNone(t.process.poll())
        self.assertEqual(t.finish(key=b"\x03"), t.original)

    def test_term_int_hup_restore_terminal(self):
        for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
            with self.subTest(signal=sig):
                t = self.terminal()
                t.key(b"\r")
                self.assertEqual(t.finish(sig=sig), t.original)
                self.assertEqual(t.process.returncode, 0)

    def test_unicode_and_repeated_input_do_not_break_ui(self):
        t = self.terminal()
        t.key(b"\r")
        t.key("日本語テスト".encode())
        for _ in range(8):
            t.key(b"a", 0.04)
        # A normal terminal transmits repeated press bytes, not held/released state.
        t.key(b"\x1bOD")  # Application-mode left arrow used by curses/keypad.
        t.key(b"\x1bOC")
        t.key(b"\x1a")  # Ctrl-Z safely pauses.
        self.assertIn(b"PAUSED", t.output)
        self.assertNotIn("日本語".encode(), t.output)
        self.assertEqual(t.finish(), t.original)

    def test_subcell_glyphs_and_ascii_toggle(self):
        t = self.terminal()
        self.assertIn(b"DOT 2x4", t.output)
        self.assertTrue(any(0x2800<=ord(ch)<=0x28ff for ch in t.output.decode("utf-8")))
        self.assertIn(b"ASCII", t.key(b"v"))
        self.assertIn(b"DOT 2x4", t.key(b"v"))
        t.key(b"\r")
        self.assertIn(b"ASCII", t.key(b"v"))
        self.assertEqual(t.finish(), t.original)

    def test_ascii_encoding_uses_compatible_fallback(self):
        with patch.dict(os.environ, {"PYTHONIOENCODING": "ascii"}):
            t = self.terminal()
        self.assertIn(b"ASCII", t.output)
        self.assertNotIn(b"DOT 2x4", t.output)
        self.assertEqual(t.finish(), t.original)

    def test_cpu_ko_result_and_rematch(self):
        t = self.terminal()
        t.key(b"\r", 14)
        self.assertIn(b"CPU WINS / KO", t.output)
        restarted = t.key(b"r", 0.1)
        self.assertIn(b"FIGHT", restarted)
        # curses may retain the final '0' from the old HP and only emit '10'.
        self.assertIn(b"#" * 20, restarted)
        self.assertIn(b"25", restarted)
        self.assertIsNone(t.process.poll())
        self.assertEqual(t.finish(), t.original)

    def test_player_attacks_hit_and_win(self):
        t = self.terminal()
        t.key(b"\r")
        cursor = 0
        def await_banner(text, timeout=3):
            nonlocal cursor
            end=time.monotonic()+timeout
            while text not in t.output[cursor:] and time.monotonic()<end:
                t.read(.01)
            found=t.output.find(text,cursor)
            self.assertNotEqual(found,-1,f"Missing banner {text!r}")
            cursor=found+len(text)
        # Read visible telegraphs, then use only real terminal keystrokes.
        for _ in range(4):
            await_banner(b"CPU WINDUP")
            t.read(.12)
            t.key(b"a",.18)
            await_banner(b"CPU WHIFF!")
            t.key(b"d",.16)
            t.key(b"j",.4)
            await_banner(b"PUNISH!")
        self.assertIn(b"PUNISH! -32", t.output)
        self.assertIn(b"YOU WIN / KO", t.output)
        self.assertEqual(t.finish(), t.original)

    def test_guard_damage_and_real_timeout(self):
        t = self.terminal()
        started = time.monotonic()
        t.key(b"\r")
        # Stay guarded by repeat bytes for the actual 25-second round.
        end = started + 26
        while b"/ TIME" not in t.output and time.monotonic() < end:
            t.key(b"k", 0.08)
        elapsed = time.monotonic() - started
        self.assertIn(b"BLOCK -2", t.output)
        self.assertIn(b"/ TIME", t.output)
        self.assertGreaterEqual(elapsed, 24.9)
        self.assertLess(elapsed, 25.4)
        self.assertEqual(t.finish(), t.original)

    def test_long_process_stall_pauses_and_resumes_safely(self):
        t = self.terminal()
        t.key(b"\r")
        try:
            t.process.send_signal(signal.SIGSTOP)
            t.read(0.65)
        finally:
            t.process.send_signal(signal.SIGCONT)
        self.assertIn(b"PAUSED", t.read(0.15))
        self.assertEqual(t.read(0.2), b"")
        self.assertIn(b"FIGHT", t.key(b"p"))
        self.assertEqual(t.finish(), t.original)

    def test_redirected_stdin_fails_cleanly(self):
        result = subprocess.run([sys.executable, str(ROOT / "dojo.py")], input=b"", capture_output=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn(b"interactive terminal", result.stderr)


if __name__ == "__main__":
    unittest.main()
