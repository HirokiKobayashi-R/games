import { spawn, execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm, lstat, rename, access } from 'node:fs/promises';
import { createServer, createConnection } from 'node:net';
import { join } from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const self = fileURLToPath(import.meta.url);
const client = fileURLToPath(new URL('../client.js', import.meta.url));
const endpoint = 'https://terminal-othello.hiroki-c3a.workers.dev';
export const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const json = async path => JSON.parse(await readFile(path, 'utf8'));

// BSD lockf owns the singleton for the supervisor's lifetime. Keep the lock
// inode (-k): unlinking it would let simultaneous launches acquire different locks.
export async function launch({ root = `/tmp/terminal-othello-${process.getuid()}`, hostScript = self } = {}) {
  await access(client);
  await mkdir(root, { mode: 0o700, recursive: true });
  const info = await lstat(root);
  if (!info.isDirectory() || info.uid !== process.getuid() || (info.mode & 0o077))
    throw new Error('Unsafe temporary directory; launch refused.');
  const job = await mkdtemp(join(root, 'run-'));
  const settings = { url: process.env.OTHELLO_URL || endpoint,
    width: process.env.OTHELLO_STONE_WIDTH === '2' ? '2' : '1', noColor: !!process.env.NO_COLOR };
  await writeFile(join(job, 'settings.json'), JSON.stringify(settings), { mode: 0o600 });
  const child = spawn('/usr/bin/lockf', ['-ks', '-t', '0', join(root, 'game.lock'),
    process.execPath, hostScript, '--host', job], { detached: true, stdio: 'ignore' });
  let ended = false, code, error;
  child.on('error', e => { error = e; ended = true; });
  child.on('exit', value => { code = value; ended = true; });
  for (let i = 0; i < 300; i++) {
    try {
      const status = await json(join(job, 'status.json'));
      child.unref();
      if (!status.ok) { await rm(job, { recursive: true, force: true }); throw new Error(status.message); }
      await writeFile(join(job, 'ack'), '');
      return status.message;
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (ended) {
      await rm(job, { recursive: true, force: true });
      if (code === 75) return 'Othello is already running or opening. Use the existing Terminal window.';
      throw new Error(error?.message || `Terminal launch failed (exit ${code}).`);
    }
    await delay(50);
  }
  child.unref();
  throw new Error('Terminal startup was not confirmed. Check Terminal before retrying.');
}

export async function host(job, { openTerminal = path => promisify(execFile)('/usr/bin/open', ['-a', 'Terminal', path], { timeout: 5000 }),
  timeout = 10000 } = {}) {
  const socketPath = join(job, 'control.sock');
  const status = async value => {
    await writeFile(join(job, 'status.tmp'), JSON.stringify(value), { mode: 0o600 });
    await rename(join(job, 'status.tmp'), join(job, 'status.json'));
  };
  const settings = await json(join(job, 'settings.json'));
  let connection, timer, started = false;
  const server = createServer();
  try {
    await new Promise((yes, no) => { server.once('error', no); server.listen(socketPath, yes); });
    const completed = new Promise((yes, no) => {
      timer = setTimeout(() => no(new Error('Terminal did not start within 10 seconds. Try the manual command.')), timeout);
      server.on('connection', socket => {
        if (connection) { socket.destroy(); return; }
        connection = socket;
        socket.write('ready\n');
        let data = '';
        socket.on('error', no);
        socket.on('data', async chunk => {
          data += chunk;
          if (!started && data.includes('started\n')) {
            started = true; clearTimeout(timer);
            try { await status({ ok: true, message: 'Othello started in its terminal runner. Play in Terminal; q quits.' }); }
            catch (e) { no(e); }
          }
        });
        socket.on('close', () => started ? yes() : no(new Error('Terminal runner exited before the game started.')));
      });
    });
    // Attach a rejection handler before awaiting the OS opener.
    completed.catch(() => {});
    const env = `OTHELLO_STONE_WIDTH=${quote(settings.width)}${settings.noColor ? ' NO_COLOR=1' : ''}`;
    const command = join(job, 'Othello.command');
    await writeFile(command, `#!/bin/sh\nexec env ${env} ${quote(process.execPath)} ${quote(self)} --run ${quote(socketPath)} ${quote(settings.url)}\n`, { mode: 0o700 });
    await openTerminal(command);
    await completed;
  } catch (e) {
    await status({ ok: false, message: e.message });
    process.exitCode = 1;
  } finally {
    clearTimeout(timer); connection?.destroy(); server.close();
    // Failure status remains for the short-lived caller to collect.
    if (started) {
      for (let i = 0; i < 40; i++) {
        try { await access(join(job, 'ack')); break; } catch {}
        await delay(50);
      }
      await rm(job, { recursive: true, force: true });
    }
    else await rm(join(job, 'Othello.command'), { force: true });
  }
}

export async function run(socketPath, url) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('An interactive terminal is required.');
  const control = createConnection(socketPath);
  await new Promise((yes, no) => {
    let response = '';
    control.once('error', no);
    control.once('close', () => no(new Error('Terminal startup request expired.')));
    control.on('data', chunk => { response += chunk; if (response.includes('ready\n')) yes(); });
  });
  let child, stopping = false, force;
  const stop = () => {
    if (stopping) return;
    stopping = true; child?.kill('SIGTERM');
    force = setTimeout(() => child?.kill('SIGKILL'), 2500);
  };
  control.on('error', stop); control.on('close', stop);
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  const raw = !!process.stdin.isRaw;
  try {
    child = spawn(process.execPath, [client, '--url', url], { stdio: 'inherit' });
    await new Promise((yes, no) => {
      child.once('spawn', () => control.write('started\n'));
      child.once('error', no);
      child.once('exit', code => { process.exitCode = code ?? 1; yes(); });
    });
  } finally {
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    control.removeListener('close', stop); clearTimeout(force); control.end();
    process.stdin.setRawMode(raw); process.stdin.pause();
    process.stdout.write('\x1b[0m\x1b[?25h\x1b[?1049l');
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === self) {
  try {
    const [mode, path, url] = process.argv.slice(2);
    if (mode === '--host' && path && !url) await host(path);
    else if (mode === '--run' && path && url) await run(path, url);
    else if (!mode) console.log(await launch());
    else throw new Error('Invalid launcher arguments.');
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
