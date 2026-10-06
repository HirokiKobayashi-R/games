"""PTY smoke test (macOS/Linux, Python standard library). Start npm run dev first."""
import os
import pty
import select
import signal
import struct
import subprocess
import sys
import termios
import time
import fcntl
import codecs
import socket

url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8787"
clients = []


class Client:
    def __init__(self, endpoint=url):
        self.master, self.slave = pty.openpty()
        self.original = termios.tcgetattr(self.slave)
        fcntl.ioctl(self.slave, termios.TIOCSWINSZ, struct.pack("HHHH", 30, 90, 0, 0))
        command = [os.environ["OTHELLO_BIN"]] if os.environ.get("OTHELLO_BIN") else ["node", "client.js"]
        self.process = subprocess.Popen(command + ["--url", endpoint],
                                        stdin=self.slave, stdout=self.slave, stderr=self.slave)
        self.text = ""
        self.decoder = codecs.getincrementaldecoder("utf-8")()
        clients.append(self)

    def expect(self, text, timeout=8):
        deadline = time.monotonic() + timeout
        while text not in self.text:
            if time.monotonic() > deadline:
                raise AssertionError(f"Missing {text!r} in terminal: {self.text[-1500:]}")
            if select.select([self.master], [], [], 0.1)[0]:
                self.text += self.decoder.decode(os.read(self.master, 65536))
        return self

    def write(self, value):
        self.text = ""
        os.write(self.master, value.encode())

    def restored(self):
        # Drain like a real terminal emulator: a full PTY output buffer can block
        # Node's synchronous TTY writes before it gets to the quit key handler.
        deadline = time.monotonic() + 5
        while self.process.poll() is None:
            if time.monotonic() > deadline:
                raise AssertionError("Client did not exit")
            if select.select([self.master], [], [], 0.1)[0]:
                self.text += self.decoder.decode(os.read(self.master, 65536))
        assert self.process.returncode == 0
        assert termios.tcgetattr(self.slave) == self.original, "Terminal mode was not restored"
        self.expect("\x1b[?25h")
        self.expect("\x1b[?1049l")


try:
    a = Client().expect("相手を検索中")
    a.write("d3\r")
    a.expect("●  3 : ○  3")
    print("PASS CPU moves while matchmaking waits")
    a.write("m")
    a.expect("検索 OFF")
    a.write("m")
    a.expect("相手を検索中")
    print("PASS terminal cancels and restarts matchmaking")
    b = Client().expect("対戦相手が見つかりました")
    a.expect("対戦相手が見つかりました")
    # The last screen must show the fresh human board, not the CPU position.
    for client in (a, b):
        assert "●  2 : ○  2" in client.text.split("\x1b[H")[-1]
        assert "\x07" in client.text
    print("PASS two terminals receive notification and switch to a fresh human game")
    b.text = ""
    a.write("q")
    a.restored()
    b.expect("あなたの勝ち")
    b.write("\x03")
    b.restored()
    c = Client().expect("相手を検索中")
    c.process.send_signal(signal.SIGTERM)
    c.restored()
    print("PASS q, Ctrl-C and SIGTERM restore tty modes, cursor and alternate screen")
    # Find an unused local port: initial connections must fail and retry.
    with socket.socket() as reserved:
        reserved.bind(("127.0.0.1", 0))
        unused_port = reserved.getsockname()[1]
    d = Client(f"http://127.0.0.1:{unused_port}")
    d.expect("接続できません")
    d.text = ""
    d.expect("接続できません")
    d.process.send_signal(signal.SIGTERM)
    d.restored()
    print("PASS initial connection failure retries without waiting for a close event")
finally:
    for client in clients:
        if client.process.poll() is None:
            client.process.terminate()
            try:
                client.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                client.process.kill()
                client.process.wait()
        os.close(client.master)
        os.close(client.slave)
