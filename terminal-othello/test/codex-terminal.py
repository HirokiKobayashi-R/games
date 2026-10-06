"""Synthetic lifecycle events + real client/opponent PTYs. No hook registration."""
import codecs
import fcntl
import json
import os
from pathlib import Path
import pty
import select
import signal
import struct
import subprocess
import sys
import tempfile
import termios
import time

root = Path(__file__).resolve().parents[1]
endpoint = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8787"
clients = []


class Terminal:
    def __init__(self, command, cwd):
        self.master, self.slave = pty.openpty()
        self.original = termios.tcgetattr(self.slave)
        fcntl.ioctl(self.slave, termios.TIOCSWINSZ, struct.pack("HHHH", 30, 90, 0, 0))
        self.process = subprocess.Popen(command, cwd=cwd, env={**os.environ, "OTHELLO_URL": endpoint},
                                        stdin=self.slave, stdout=self.slave, stderr=self.slave)
        self.text = ""
        self.decoder = codecs.getincrementaldecoder("utf-8")()
        clients.append(self)

    def drain(self):
        if select.select([self.master], [], [], 0.05)[0]:
            self.text += self.decoder.decode(os.read(self.master, 65536))

    def expect(self, value):
        end = time.monotonic() + 8
        while value not in self.text:
            assert time.monotonic() < end, f"Missing {value}: {self.text[-1000:]}"
            self.drain()

    def exited(self):
        end = time.monotonic() + 5
        while self.process.poll() is None:
            assert time.monotonic() < end, "Game did not stop"
            self.drain()
        assert self.process.returncode == 0
        assert termios.tcgetattr(self.slave) == self.original
        self.expect("\x1b[?1049l")


def hook(cwd, event, session, turn="turn-test"):
    result = subprocess.run(["node", str(root / "codex/hook.js")], input=json.dumps({
        "cwd": str(cwd), "session_id": session, "turn_id": turn, "hook_event_name": event,
        "prompt": "PRIVATE_CONTENT_MUST_NOT_LEAVE_THIS_PROCESS",
        "tool_input": {"command": "PRIVATE_COMMAND"},
    }), text=True, capture_output=True, check=True)
    assert result.stdout == "{}\n" and result.stderr == ""


try:
    with tempfile.TemporaryDirectory(prefix="othello-lifecycle-") as folder:
        cwd = Path(folder)
        for event, label in [("PermissionRequest", "承認が必要"), ("Stop", "作業が完了"),
                             ("Interrupt", "作業が中断"), ("SessionEnd", "セッションが終了")]:
            session = "test-" + event
            hook(cwd, "UserPromptSubmit", session)
            watched = Terminal(["node", str(root / "codex/launch.js"), "--watch"], cwd)
            watched.expect("相手を検索中")
            other = Terminal(["node", str(root / "client.js"), "--url", endpoint], cwd)
            other.expect("対戦相手が見つかりました")
            watched.expect("対戦相手が見つかりました")
            hook(cwd, event, session)
            watched.expect(label)
            watched.exited()
            other.expect("あなたの勝ち")
            os.write(other.master, b"q")
            other.exited()
            print(f"PASS {event}: watched game resigns, opponent wins, terminal restored")
        # Terminal state must not resume play when the tool finishes.
        hook(cwd, "PostToolUse", session)
        refused = Terminal(["node", str(root / "codex/launch.js"), "--watch"], cwd)
        refused.expect("監視できる作業がありません")
        refused.process.wait(timeout=5)
        assert refused.process.returncode == 1
        print("PASS no silent fallback to unmonitored play")
finally:
    for client in clients:
        if client.process.poll() is None:
            client.process.send_signal(signal.SIGTERM)
            end = time.monotonic() + 4
            while client.process.poll() is None and time.monotonic() < end:
                client.drain()
            if client.process.poll() is None:
                client.process.kill()
            client.process.wait(timeout=3)
        os.close(client.master)
        os.close(client.slave)
