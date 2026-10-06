import test from 'node:test';
import assert from 'node:assert/strict';
import { boardRows, boardChange, boardLayout, renderScreen } from '../render.js';
import { initialGame, play } from '../rules.js';

function positions(row, ambiguous = 1) {
  let col = 1, max = 0; const stones = [];
  for (const token of row.match(/\x1b\[[0-9;]*[A-Za-z]|./gu) || []) {
    if (token.startsWith('\x1b')) { if (token.endsWith('G')) col = Number(token.slice(2, -1)); continue; }
    if ('●○'.includes(token)) stones.push(col);
    col += /[●○·▄▀]/u.test(token) ? ambiguous : token.codePointAt(0) >= 0x1100 ? 2 : 1;
    max = Math.max(max, col - 1);
  }
  return { stones, max };
}

test('disc centers coincide with tile centers horizontally and vertically for both widths', () => {
  const board = Array.from({ length: 64 }, (_, i) => i % 2 + 1);
  for (const color of [0, 4, 8]) for (const [columns, rows] of [[40, 22], [58, 30], [80, 40]]) for (const width of [1, 2]) {
    const layout = boardLayout(columns, rows, width);
    const lines = boardRows(board, new Set(), 0, { color, columns, rows, stoneWidth: width, last: 5 });
    let stoneRow = 0;
    for (let row = 0; row < lines.length; row++) {
      const p = positions(lines[row], width);
      assert.ok(p.max < columns);
      if (!p.stones.length) continue;
      assert.equal(p.stones.length, 8);
      for (let x = 0; x < 8; x++) {
        const tileLeft = layout.left + 4 + x * layout.cellWidth; // zero-based cell edge
        assert.equal(p.stones[x] - 1 + width / 2, tileLeft + layout.cellWidth / 2);
      }
      const tileTop = 2 + stoneRow * (layout.height + Number(layout.separators));
      assert.equal(row + 0.5, tileTop + layout.height / 2);
      stoneRow++;
    }
    assert.equal(stoneRow, 8);
    if (!color) assert.ok(lines.every(s => !/\x1b\[[0-9;]*m/.test(s)));
  }
});

test('screen stays inside resized terminal and preserves result without color', () => {
  for (const columns of [1, 8, 39, 40, 58, 90]) for (const rows of [1, 3, 21, 22, 24, 30, 36, 37, 40]) for (const stoneWidth of [1, 2]) {
    const lines = renderScreen({ game: initialGame(), columns, rows, stoneWidth, colors: 8, note: '非常に長い状態メッセージ'.repeat(30) });
    assert.ok(lines.length <= Math.max(1, rows - 1));
    assert.ok(lines.every(line => positions(line, stoneWidth).max < columns || columns === 1 && !line));
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

test('selection, final move and edge-on flip use the same tile center', () => {
  const game = initialGame(), next = play(game, 1, 19), effect = boardChange(game.board, next.board);
  for (const width of [1, 2]) {
    const opts = { columns: 80, rows: 40, stoneWidth: width, color: 8, last: 19, effect, phase: 1 };
    const layout = boardLayout(80, 40, width);
    const row = boardRows(next.board, new Set([18]), 27, opts)[2 + 3 * layout.height + 1];
    const start = layout.left + 5 + 3 * layout.cellWidth;
    const center = start + (layout.cellWidth - width) / 2;
    assert.ok(row.includes(`\x1b[${center}G`));
    assert.ok(row.includes('38;5;229;1m' + '|'.repeat(width)));
    assert.ok(row.includes(`\x1b[${start}G\x1b[48;5;58;1;93m[`));
    assert.ok(row.includes(`\x1b[${start + layout.cellWidth - 1}G\x1b[48;5;58;1;93m]`));
  }
});
