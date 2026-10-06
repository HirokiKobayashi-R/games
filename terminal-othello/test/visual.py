"""Actual PTY rendering, animation, resize and cleanup; no external service needed."""
import codecs
import fcntl
import os
from pathlib import Path
import pty
import re
import select
import signal
import socket
import struct
import subprocess
import termios
import time

root = Path(__file__).resolve().parents[1]
with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    endpoint = 'http://127.0.0.1:' + str(probe.getsockname()[1])

for no_color in (False, True):
    master, slave = pty.openpty()
    original = termios.tcgetattr(slave)
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 30, 80, 0, 0))
    env = {**os.environ, 'TERM': 'xterm-256color'}
    env.pop('NO_COLOR', None)
    if no_color:
        env['NO_COLOR'] = '1'
    child = subprocess.Popen(['node', str(root / 'client.js'), '--url', endpoint], stdin=slave, stdout=slave, stderr=slave, env=env)
    output = ''
    decoder = codecs.getincrementaldecoder('utf-8')()

    def expect(value):
        global output
        end = time.monotonic() + 4
        while value not in output:
            assert time.monotonic() < end, 'Missing ' + repr(value)
            if select.select([master], [], [], .02)[0]:
                output += decoder.decode(os.read(master, 65536))

    def key(value):
        global output
        output = ''
        os.write(master, value)

    def resize(rows, cols):
        global output
        output = ''
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
        child.send_signal(signal.SIGWINCH)

    try:
        expect('CPU 練習')
        expect('q:終了')
        if no_color:
            assert not re.search(r'\x1b\[(?!0m)[0-9;]+m', output)
        else:
            assert '\x1b[48;5;22m' in output
            if os.environ.get('OTHELLO_CAPTURE'):
                Path(os.environ['OTHELLO_CAPTURE']).write_text(output)
        resize(22, 40); expect('q:終了')
        resize(6, 28); expect('Resize to 40 x 22')
        key(b'd3\r'); resize(30, 80); expect('●  2 : ○  2')  # Hidden moves are ignored.
        key(b'd3\r')
        if not no_color:
            expect('38;5;229;1m |')  # Edge-on frame, about 80ms into the flip.
            key(b'\x1b[D'); expect('[c3]')  # Cursor responds during the animation.
        else:
            expect('●  4 : ○  1')
            assert not re.search(r'\x1b\[(?!0m)[0-9;]+m', output)
        key(b'q')
        expect('\x1b[?1049l'); child.wait(timeout=3)
        assert child.returncode == 0 and termios.tcgetattr(slave) == original
        print('PASS', 'NO_COLOR' if no_color else 'color/flip/input', 'resize, hidden move guard, quit and terminal restoration')
    finally:
        if child.poll() is None:
            child.kill(); child.wait()
        os.close(master); os.close(slave)
