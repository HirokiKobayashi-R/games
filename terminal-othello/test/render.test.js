import test from 'node:test';
import assert from 'node:assert/strict';
import { boardRows, boardChange, renderScreen } from '../render.js';
import { initialGame, play } from '../rules.js';

function positions(row, ambiguous = 1) {
  let col = 1, max = 0; const stones = [];
  for (const token of row.match(/\x1b\[[0-9;]*[A-Za-z]|./gu) || []) {
    if (token.startsWith('\x1b')) { if (token.endsWith('G')) col = Number(token.slice(2, -1)); continue; }
    if ('●○'.includes(token)) stones.push(col);
    col += /[●○·]/u.test(token) ? ambiguous : token.codePointAt(0) >= 0x1100 ? 2 : 1;
    max = Math.max(max, col - 1);
  }
  return { stones, max };
}

test('colored and monochrome boards keep narrow/wide discs inside anchored cells', () => {
  const board = Array.from({ length: 64 }, (_, i) => i % 2 + 1);
  for (const color of [0, 4, 8]) for (const tall of [false, true]) for (const width of [1, 2]) {
    const lines = boardRows(board, new Set(), 0, { color, tall, last: 5 });
    for (const row of lines.filter(s => /[●○]/u.test(s))) {
      const p = positions(row, width);
      assert.deepEqual(p.stones, [6, 10, 14, 18, 22, 26, 30, 34]);
      assert.ok(p.max <= 37);
    }
    if (!color) assert.ok(lines.every(s => !/\x1b\[[0-9;]*m/.test(s)));
  }
});

test('screen stays inside resized terminal and preserves result without color', () => {
  for (const columns of [1, 8, 39, 40, 58, 90]) for (const rows of [1, 3, 21, 22, 24, 30]) {
    const lines = renderScreen({ game: initialGame(), columns, rows, colors: 8, note: '非常に長い状態メッセージ'.repeat(30) });
    assert.ok(lines.length <= Math.max(1, rows - 1));
    assert.ok(lines.every(line => positions(line, 2).max < columns || columns === 1 && !line));
  }
  const lines = renderScreen({ game: { ...initialGame(), board: Array(64).fill(1), ended: true }, colors: 0 });
  assert.ok(lines.some(line => line.includes('あなたの勝ち')));
  assert.ok(lines.every(line => !/\x1b\[[0-9;]*m/.test(line)));
});

test('flip sequence is limited to one move; resets/reconnect jumps do not animate', () => {
  const game = initialGame(), next = play(game, 1, 19), effect = boardChange(game.board, next.board);
  assert.deepEqual(effect.flipped, [27]); assert.equal(effect.placed, 19);
  assert.equal(boardChange(undefined, next.board), null);
  assert.equal(boardChange(next.board, game.board), null);
  const jumped = [...next.board]; jumped[0] = jumped[1] = 1;
  assert.equal(boardChange(game.board, jumped), null);
  const frames = [0, 1, 2, 3].map(phase => boardRows(next.board, new Set(), 19, { color: 8, effect, phase }).join('\n'));
  assert.notEqual(frames[0], frames[1]); assert.notEqual(frames[1], frames[2]);
  assert.ok(frames[0].includes('○')); assert.ok(frames[3].includes('●'));
});
