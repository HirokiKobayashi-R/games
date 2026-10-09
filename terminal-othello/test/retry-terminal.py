"""Local WebSocket refusal through a real client PTY. No public requests."""
import base64
import codecs
import fcntl
import hashlib
import os
from pathlib import Path
import pty
import select
import socket
import struct
import subprocess
import termios
import threading
import time

root = Path(__file__).resolve().parents[1]
server = socket.socket()
server.bind(('127.0.0.1', 0))
server.listen()
server.settimeout(.1)
stopping = threading.Event()
connections = []
errors = []


def refuse():
    while not stopping.is_set():
        try:
            connection, _ = server.accept()
        except socket.timeout:
            continue
        try:
            with connection:
                connection.settimeout(2)
                request = b''
                while b'\r\n\r\n' not in request:
                    request += connection.recv(4096)
                    assert len(request) < 16384
                headers = dict(line.split(': ', 1) for line in request.decode().split('\r\n')[1:] if ': ' in line)
                key = next(value for name, value in headers.items() if name.lower() == 'sec-websocket-key')
                accept = base64.b64encode(hashlib.sha1((key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
                connection.sendall(('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
                                    + 'Sec-WebSocket-Protocol: othello\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n').encode())
                connections.append(time.monotonic())
                # A valid policy close, identical to the Worker's budget refusal.
                connection.sendall(b'\x88\x02' + struct.pack('!H', 4008))
                connection.recv(4096)
        except Exception as exc:
            errors.append(str(exc))


thread = threading.Thread(target=refuse)
thread.start()
master, slave = pty.openpty()
original = termios.tcgetattr(slave)
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 100, 0, 0))
child = subprocess.Popen(['node', str(root / 'client.js'), '--url', 'http://127.0.0.1:' + str(server.getsockname()[1])],
                         stdin=slave, stdout=slave, stderr=slave, env={**os.environ, 'TERM': 'xterm-256color'})
decoder = codecs.getincrementaldecoder('utf-8')()
output = ''


def drain(seconds):
    global output
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if select.select([master], [], [], .02)[0]:
            output += decoder.decode(os.read(master, 65536))


def expect(text):
    end = time.monotonic() + 5
    while text not in output:
        assert time.monotonic() < end, 'Missing ' + text
        drain(.05)


try:
    expect('自動接続を停止'); drain(2)
    assert len(connections) == 1
    output = ''; os.write(master, b'd3\r'); expect('● 04'); expect('● 03')
    output = ''; os.write(master, b'r'); expect('自動接続を停止'); drain(2)
    assert len(connections) == 2 and not errors
    output = ''; os.write(master, b'q'); expect('\x1b[?1049l'); child.wait(timeout=3)
    assert child.returncode == 0 and termios.tcgetattr(slave) == original
    print('PASS budget close stops auto retry, CPU still plays, r reconnects once, q restores terminal')
finally:
    if child.poll() is None:
        child.kill(); child.wait()
    os.close(master); os.close(slave)
    stopping.set(); thread.join(timeout=3); server.close()
