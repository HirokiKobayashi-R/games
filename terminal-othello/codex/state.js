import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { mkdir, lstat, readFile, writeFile, rename, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';

export const LEASE_MS = 5 * 60_000;
export const digest = value => createHash('sha256').update(value).digest('hex');
export function projectRoot(cwd) {
  let root = resolve(cwd);
  try { root = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1000 }).trim(); } catch {}
  try { return realpathSync(root); } catch { return root; }
}
export const stateDirectory = (cwd, base = join(tmpdir(), `terminal-othello-${process.getuid()}`)) => join(base, digest(projectRoot(cwd)));

// No prompt, tool arguments, file paths or transcript content are retained.
export function transition(previous, input, now = Date.now()) {
  const event = input.hook_event_name;
  if (typeof input.session_id !== 'string' || input.session_id.length > 256 || input.agent_id) return previous;
  const session = digest(input.session_id);
  const turn = typeof input.turn_id === 'string' ? digest(input.turn_id) : null;
  if (event === 'UserPromptSubmit' && turn && previous?.session === session && previous.turn === turn) return previous;
  if (event === 'UserPromptSubmit' && turn) return { version: 1, session, turn, status: 'working', updated: now };
  if (!previous || previous.session !== session) return previous;
  if (event !== 'SessionEnd' && (!turn || previous.turn !== turn)) return previous;
  const statuses = { PermissionRequest: 'approval', Stop: 'done', Interrupt: 'interrupted', SessionEnd: 'ended' };
  if (statuses[event]) return { ...previous, status: statuses[event], updated: now };
  // PostToolUse is only a heartbeat. It cannot infer that an approval was granted.
  if (event === 'PostToolUse' && previous.status === 'working') return { ...previous, updated: now };
  return previous;
}

export function playable(state, now = Date.now()) {
  return state?.status === 'working' && Number.isFinite(state.updated) && now - state.updated >= 0 && now - state.updated < LEASE_MS;
}

export async function privateDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  for (const path of [dirname(directory), directory]) {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077)) throw new Error('Unsafe state directory');
  }
}

export async function readState(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid() || info.size > 2048 || (info.mode & 0o077)) throw new Error('Unsafe state file');
  const value = JSON.parse(await readFile(path, 'utf8'));
  if (value.version !== 1 || !/^[a-f0-9]{64}$/.test(value.session) || !/^[a-f0-9]{64}$/.test(value.turn) || !Number.isFinite(value.updated)) throw new Error('Invalid state');
  return value;
}

export async function record(directory, input, now = Date.now()) {
  if (typeof input.session_id !== 'string' || input.session_id.length > 256) return;
  await privateDirectory(directory);
  const name = digest(input.session_id), path = join(directory, name + '.json'), lock = join(directory, name + '.lock');
  // Hooks can arrive concurrently. A short per-session lock prevents a late
  // PostToolUse write from overwriting Stop/PermissionRequest.
  let acquired = false;
  for (let i = 0; i < 20; i++) {
    try { await mkdir(lock, { mode: 0o700 }); acquired = true; break; }
    catch (e) { if (e.code !== 'EEXIST') throw e; await new Promise(r => setTimeout(r, 20)); }
  }
  if (!acquired) return; // Fail closed through the lease; never block Codex.
  const temporary = join(directory, `${name}.${randomUUID()}.tmp`);
  try {
    let previous;
    try { previous = await readState(path); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const next = transition(previous, input, now);
    if (next && next !== previous) {
      await writeFile(temporary, JSON.stringify(next), { mode: 0o600, flag: 'wx' });
      await rename(temporary, path);
    }
  } finally { await rm(temporary, { force: true }); await rm(lock, { recursive: true, force: true }); }
}

export async function workingSessions(directory) {
  try { await privateDirectory(directory); } catch { return []; }
  const candidates = [];
  for (const name of await readdir(directory)) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
    const path = join(directory, name);
    try {
      const state = await readState(path);
      if (playable(state)) candidates.push({ path, ...state });
      else if (Date.now() - state.updated > 86400_000) await rm(path);
    } catch {}
  }
  return candidates.sort((a, b) => b.updated - a.updated);
}
