import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { transition, digest, record, readState, workingSessions, playable, LEASE_MS } from '../codex/state.js';

const event = (name, turn = 'turn-a', session = 'session-a') => ({ hook_event_name: name, session_id: session, turn_id: turn });

test('only a new user turn starts play; completion and approval are sticky', () => {
  assert.equal(transition(undefined, event('PostToolUse')), undefined);
  for (const [name, status] of Object.entries({ PermissionRequest: 'approval', Stop: 'done', Interrupt: 'interrupted', SessionEnd: 'ended' })) {
    const running = transition(undefined, event('UserPromptSubmit'), 1000);
    const stopped = transition(running, event(name), 1100);
    assert.equal(stopped.status, status);
    assert.equal(transition(stopped, event('PostToolUse'), 1200), stopped);
    assert.equal(transition(stopped, event('UserPromptSubmit'), 1200), stopped);
    assert.equal(transition(stopped, event('UserPromptSubmit', 'turn-b'), 1300).status, 'working');
  }
});

test('old turns, subagents, and other sessions cannot stop the chosen turn', () => {
  const running = transition(undefined, event('UserPromptSubmit', 'new'), 1000);
  assert.equal(transition(running, event('Stop', 'old')), running);
  assert.equal(transition(running, event('PermissionRequest', 'new', 'other')), running);
  assert.equal(transition(running, { ...event('Stop', 'new'), agent_id: 'child' }), running);
  assert.equal(playable(running, 1001), true);
  assert.equal(playable(running, 1000 + LEASE_MS), false);
  assert.equal(playable(running, 999), false);
});

test('concurrent hooks never overwrite a stop with a heartbeat; stored state is minimal and private', async () => {
  const root = await mkdtemp(join(tmpdir(), 'othello-state-test-'));
  const directory = join(root, 'project');
  try {
    await record(directory, { ...event('UserPromptSubmit'), prompt: 'PRIVATE PROMPT', tool_input: { code: 'PRIVATE CODE' }, transcript_path: '/private/transcript' });
    await Promise.all(Array.from({ length: 8 }, (_, i) => record(directory, event(i === 4 ? 'Stop' : 'PostToolUse'))));
    const path = join(directory, digest('session-a') + '.json');
    const data = await readState(path);
    assert.equal(data.status, 'done');
    assert.deepEqual(Object.keys(data).sort(), ['session', 'status', 'turn', 'updated', 'version']);
    const raw = await readFile(path, 'utf8');
    assert.doesNotMatch(raw, /PRIVATE|session-a|turn-a|transcript/);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
    assert.equal((await workingSessions(directory)).length, 0);
    await record(directory, event('UserPromptSubmit', 'next'));
    await record(directory, event('UserPromptSubmit', 'other-turn', 'session-b'));
    assert.equal((await workingSessions(directory)).length, 2);
    const link = join(directory, 'link.json'); await symlink(path, link);
    await assert.rejects(readState(link), /Unsafe/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('project hook configuration is advisory and only invokes local lifecycle recorder', async () => {
  const config = JSON.parse(await readFile(new URL('../.codex/hooks.json', import.meta.url)));
  assert.deepEqual(Object.keys(config.hooks).sort(), ['Interrupt', 'PermissionRequest', 'PostToolUse', 'SessionEnd', 'Stop', 'UserPromptSubmit']);
  for (const groups of Object.values(config.hooks)) {
    assert.equal(groups.length, 1);
    const hook = groups[0].hooks[0];
    assert.equal(hook.type, 'command'); assert.equal(hook.timeout, 3);
    assert.ok(hook.command.endsWith('/codex/hook.js"'));
    assert.equal(hook.async, undefined);
  }
});
