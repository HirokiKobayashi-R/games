import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('public QA cannot send a move until that exact game is confirmed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'othello-qa-guard-'));
  const allowed = join(dir, 'game');
  writeFileSync(allowed, '');
  try {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import {writeFileSync} from 'node:fs';
      const sent=[];
      globalThis.WebSocket=class extends EventTarget {send(data){sent.push(data);} close(){}};
      await import(${JSON.stringify(new URL('./qa-tap.mjs', import.meta.url).href)});
      const socket=new WebSocket();
      const move=game=>JSON.stringify({type:'move',game,cell:19});
      socket.send(move('owned')); assert.equal(sent.length,0);
      writeFileSync(process.env.OTHELLO_QA_GAME,'owned');
      socket.send(move('stranger')); assert.equal(sent.length,0);
      socket.send(move('owned')); assert.deepEqual(sent,[move('owned')]);
      socket.send('ping'); assert.equal(sent[1],'ping');
    `], { env: { ...process.env, OTHELLO_QA_GAME: allowed }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
