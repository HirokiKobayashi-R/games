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

for no_color, stone_width in [(False, 1), (False, 2), (True, 1), (True, 2)]:
    master, slave = pty.openpty()
    original = termios.tcgetattr(slave)
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 30, 80, 0, 0))
    env = {**os.environ, 'TERM': 'xterm-256color', 'OTHELLO_STONE_WIDTH': str(stone_width)}
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

    def frame_containing(value):
        """Wait for a complete matching frame, ignoring a queued pre-resize draw."""
        global output
        end = time.monotonic() + 4
        while True:
            frames = [part.split('\x1b[J', 1)[0] + '\x1b[J'
                      for part in output.split('\x1b[H')[1:] if '\x1b[J' in part]
            matches = [frame for frame in frames if value in frame]
            if matches:
                return '\x1b[H' + matches[-1]
            assert time.monotonic() < end, 'Missing complete frame with ' + repr(value)
            if select.select([master], [], [], .02)[0]:
                output += decoder.decode(os.read(master, 65536))

    def resize(rows, cols):
        global output
        output = ''
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
        child.send_signal(signal.SIGWINCH)

    try:
        expect('CPU 練習')
        frame = frame_containing('q:終了')
        if no_color:
            assert not re.search(r'\x1b\[(?!0m)[0-9;]+m', output)
        else:
            assert ';5;' in output
            if os.environ.get('OTHELLO_CAPTURE'):
                Path(os.environ['OTHELLO_CAPTURE'] + f'-width{stone_width}-30.ansi').write_text(frame)
        resize(40, 80)
        frame = frame_containing('q:終了')
        if not no_color and os.environ.get('OTHELLO_CAPTURE'):
            Path(os.environ['OTHELLO_CAPTURE'] + f'-width{stone_width}-40.ansi').write_text(frame)
        resize(22, 40)
        # The long help text is clipped at 40 columns. Wait for the new compact
        # border, not help text from a queued frame drawn at the previous size.
        frame_containing('Enter  m:検索  q:終了')
        resize(6, 28); expect('Resize to 40 x 22')
        key(b'd3\r'); resize(30, 80); expect('● 02')  # Hidden moves are ignored.
        key(b'd3\r')
        if not no_color:
            expect('● 04')  # Rendering changes immediately without blocking input.
            key(b'\x1b[D'); expect('[c3]')  # Cursor responds during the animation.
        else:
            expect('● 04')
            assert not re.search(r'\x1b\[(?!0m)[0-9;]+m', output)
        key(b'q')
        expect('\x1b[?1049l'); child.wait(timeout=3)
        assert child.returncode == 0 and termios.tcgetattr(slave) == original
        print('PASS', f'width={stone_width}', 'NO_COLOR' if no_color else 'color/flip/input', 'resize, hidden move guard, quit and terminal restoration')
    finally:
        if child.poll() is None:
            child.kill(); child.wait()
        os.close(master); os.close(slave)
