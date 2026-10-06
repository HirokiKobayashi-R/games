"""Real macOS lock/launcher/runner tests. Only the GUI opener is replaced.
No GUI access, Codex configuration changes, or external game service required.
"""
import codecs
import fcntl
import json
import os
from pathlib import Path
import pty
import select
import shutil
import signal
import socket
import struct
import subprocess
import tempfile
import termios
import time

source = Path(__file__).resolve().parents[1]
node = shutil.which('node')
assert node and os.uname().sysname == 'Darwin', 'Requires macOS and Node.js 22+'
with tempfile.TemporaryDirectory(prefix='oth-plugin-', dir='/tmp') as temp:
    work = Path(temp)
    package = work / "game space's $(no-execution)"
    shutil.copytree(source, package, ignore=shutil.ignore_patterns('node_modules', '.wrangler', '__pycache__'))
    module = (package / 'scripts/terminal.mjs').as_uri()
    host = work / 'host.mjs'
    host.write_text('import {host} from ' + json.dumps(module) + ';\n' +
        'import {writeFile} from "node:fs/promises";\n' +
        'await host(process.argv[3], {timeout: process.env.TEST_FAIL === "timeout" ? 150 : 4000, openTerminal: async path => {\n' +
        'if (process.env.TEST_FAIL === "open") throw new Error("Simulated OS opener failure");\n' +
        'await writeFile(path + ".ready", ""); }});\n')
    launch = work / 'launch.mjs'
    launch.write_text('import {launch} from ' + json.dumps(module) + ';\n' +
        'try { console.log(await launch({root: process.argv[2], hostScript: process.argv[3]})); }\n' +
        'catch(e) {console.error(e.message); process.exitCode=1;}\n')
    lockroot = work / 'lock'
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        endpoint = 'http://127.0.0.1:' + str(probe.getsockname()[1])
    env = {**os.environ, 'TERM': 'xterm-256color', 'OTHELLO_URL': endpoint}
    args = [node, str(launch), str(lockroot), str(host)]

    def wait_for(predicate):
        end = time.monotonic() + 5
        while not predicate():
            assert time.monotonic() < end, 'Timed out'
            time.sleep(.02)

    for exit_mode in ['q', 'SIGINT', 'SIGTERM']:
        caller = subprocess.Popen(args, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        wait_for(lambda: list(lockroot.glob('run-*/Othello.command.ready')))
        ready = next(lockroot.glob('run-*/Othello.command.ready'))
        pending = subprocess.run(args, env=env, capture_output=True, timeout=3)
        assert pending.returncode == 0 and b'already running' in pending.stdout
        command = Path(str(ready).removesuffix('.ready'))
        master, slave = pty.openpty()
        original = termios.tcgetattr(slave)
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 80, 0, 0))
        runner = subprocess.Popen(['/bin/sh', str(command)], stdin=slave, stdout=slave, stderr=slave, env=env)
        data = ''
        decoder = codecs.getincrementaldecoder('utf-8')()

        def expect(text):
            global data
            end = time.monotonic() + 5
            while text not in data:
                assert time.monotonic() < end, 'Missing ' + repr(text)
                if select.select([master], [], [], .02)[0]:
                    data += decoder.decode(os.read(master, 65536))
        try:
            expect('CPU 練習'); expect('q:終了')
            out, err = caller.communicate(timeout=3)
            assert caller.returncode == 0 and b'started' in out, (out, err)
            duplicates = [subprocess.Popen(args, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE) for _ in range(5)]
            for duplicate in duplicates:
                out, err = duplicate.communicate(timeout=3)
                assert duplicate.returncode == 0 and b'already running' in out, (out, err)
            assert len(list(lockroot.glob('run-*/Othello.command.ready'))) == 1
            os.write(master, b'd3\r'); expect('● 04')
            if exit_mode == 'q': os.write(master, b'q')
            else: runner.send_signal(getattr(signal, exit_mode))
            expect('\x1b[?1049l'); runner.wait(timeout=4)
            assert runner.returncode == 0
            assert termios.tcgetattr(slave) == original
            wait_for(lambda: not list(lockroot.glob('run-*')))
            print('PASS plugin', exit_mode, 'space/quote paths, CPU move, concurrent duplicate requests, cleanup, tty restoration')
        finally:
            if runner.poll() is None: runner.kill(); runner.wait()
            if caller.poll() is None: caller.kill(); caller.wait()
            os.close(master); os.close(slave)

    for failure in ['open', 'timeout']:
        result = subprocess.run(args, env={**env, 'TEST_FAIL': failure}, capture_output=True, timeout=4)
        assert result.returncode == 1 and (b'failure' if failure == 'open' else b'did not start') in result.stderr, result
        wait_for(lambda: not list(lockroot.glob('run-*')))
        print('PASS opener', failure, 'reported; temporary request removed; lock released')

    empty = work / 'empty-bin'; empty.mkdir()
    wrapper = package / 'scripts/othello.sh'
    result = subprocess.run(['/bin/sh', str(wrapper)], env={**env, 'PATH': str(empty)}, capture_output=True)
    assert result.returncode == 1 and b'Node.js 22+' in result.stderr
    fake = empty / 'node'; fake.write_text('#!/bin/sh\nexit 1\n'); fake.chmod(0o700)
    result = subprocess.run(['/bin/sh', str(wrapper)], env={**env, 'PATH': str(empty)}, capture_output=True)
    assert result.returncode == 1 and b'Node.js 22+' in result.stderr
    fake.write_text('#!/bin/sh\nexit 0\n')
    uname = empty / 'uname'; uname.write_text('#!/bin/sh\necho Linux\n'); uname.chmod(0o700)
    result = subprocess.run(['/bin/sh', str(wrapper)], env={**env, 'PATH': str(empty)}, capture_output=True)
    assert result.returncode == 1 and b'macOS only' in result.stderr
    result = subprocess.run([node, str(package / 'scripts/terminal.mjs'), '--run', '/missing', endpoint], capture_output=True)
    assert result.returncode == 1 and b'interactive terminal' in result.stderr
    print('PASS missing/old Node, unsupported OS and non-TTY rejected before GUI launch')
