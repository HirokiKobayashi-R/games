import test from 'node:test';
import assert from 'node:assert/strict';
import { boardRows, boardChange, boardLayout, renderScreen, tilePixel } from '../render.js';
import { initialGame, play } from '../rules.js';

function positions(row, ambiguous = 1) {
  let col = 1, max = 0; const stones = [];
  for (const token of row.match(/\x1b\[[0-9;]*[A-Za-z]|./gu) || []) {
    if (token.startsWith('\x1b')) { if (token.endsWith('G')) col = Number(token.slice(2, -1)); continue; }
    if ('●○'.includes(token)) stones.push(col);
    col += /[●○·\u2580-\u259f]/u.test(token) ? ambiguous : token.codePointAt(0) >= 0x1100 ? 2 : 1;
    max = Math.max(max, col - 1);
  }
  return { stones, max };
}
const plain = line => line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

test('fallback discs stay centered; raster discs have symmetric circular coverage', () => {
  const board = Array.from({ length: 64 }, (_, i) => i % 2 + 1);
  for (const color of [0, 4]) for (const [columns, rows] of [[40, 22], [58, 30], [80, 40]]) for (const width of [1, 2]) {
    const layout = boardLayout(columns, rows, width, color);
    const lines = boardRows(board, new Set(), 0, { color, columns, rows, stoneWidth: width });
    for (const row of lines.slice(1)) {
      const p = positions(row, width);
      assert.equal(p.stones.length, 8);
      for (let x = 0; x < 8; x++) assert.equal(p.stones[x] - 1 + width / 2, layout.boardLeft + (x + .5) * layout.cellWidth);
    }
  }
  for (const [width, height] of [[6, 4], [6, 6], [8, 8]]) {
    const inside = (x, y) => JSON.stringify(tilePixel(x, y, {width, height, value: 2})) !== JSON.stringify(tilePixel(x, y, {width, height, value: 0}));
    for (let y = .5; y < height; y++) for (let x = .25; x < width; x += .5) {
      assert.equal(inside(x, y), inside(width - x, y));
      assert.equal(inside(x, y), inside(x, height - y));
    }
    assert.equal(inside(.25, .5), false);
    assert.equal(inside(width / 2, height / 2), true);
  }
});

test('all layouts fit narrow/tall screens, both character widths and color depths', () => {
  for (const columns of [1, 8, 39, 40, 54, 58, 62, 78, 80, 100]) for (const rows of [1, 3, 21, 22, 24, 29, 30, 38, 39, 40, 46, 47, 48])
    for (const stoneWidth of [1, 2]) for (const colors of [0, 4, 8, 24]) {
      const lines = renderScreen({ game: initialGame(), columns, rows, stoneWidth, colors, note: '長いメッセージ'.repeat(30) });
      assert.ok(lines.length <= Math.max(1, rows - 1), `${columns}x${rows} has ${lines.length} rows`);
      assert.ok(lines.every(line => positions(line, stoneWidth).max < columns || columns === 1 && !line), `${columns}x${rows} width ${stoneWidth}`);
      if (columns >= 40 && rows >= 22) assert.ok(lines.some(line => plain(line).includes('q:終了')));
      if (!colors) assert.ok(lines.every(line => !/\x1b\[[0-9;]*m/.test(line)));
    }
});

test('score, result, pass, opponent recovery and both player colors remain explicit', () => {
  const game = initialGame();
  for (const color of [1, 2]) {
    const frame = opts => renderScreen({game, remote: true, online: true, color, columns:80, rows:40, colors:8, ...opts}).map(plain).join('\n');
    assert.ok(frame({}).includes(color === 1 ? 'BLACK / YOU' : 'WHITE / YOU'));
    assert.ok(frame({}).includes('● 02')); assert.ok(frame({}).includes('○ 02'));
    assert.ok(frame({opponentOnline:false}).includes('RECONNECT'));
    assert.ok(frame({game:{...game, passed:2}}).includes('パス'));
    assert.ok(frame({game:{...game, ended:true,winner:color}}).includes('あなたの勝ち'));
    assert.ok(frame({game:{...game, ended:true,winner:0}}).includes('引き分け'));
  }
});

test('flip sequence changes only on one observed move, with a narrow middle frame', () => {
  const game = initialGame(), next = play(game, 1, 19), effect = boardChange(game.board, next.board);
  assert.deepEqual(effect.flipped, [27]); assert.equal(effect.placed, 19);
  assert.equal(boardChange(undefined, next.board), null);
  assert.equal(boardChange(next.board, game.board), null);
  const jumped = [...next.board]; jumped[0] = jumped[1] = 1;
  assert.equal(boardChange(game.board, jumped), null);
  for (const colors of [0, 8, 24]) {
    const frames = [0,1,2,3].map(phase => boardRows(next.board,new Set(),19,{color:colors,columns:80,rows:40,effect,phase}).join('\n'));
    assert.notEqual(frames[0],frames[1]); assert.notEqual(frames[1],frames[2]);
  }
});


test('wide block glyphs and ordinary spaces advance to every tile edge', () => {
  for (const stoneWidth of [1,2]) {
    const options={color:8,columns:80,rows:40,stoneWidth};
    const layout=boardLayout(80,40,stoneWidth,8);
    for (const line of boardRows(Array(64).fill(0),new Set(),-1,options).slice(1))
      assert.equal(positions(line,stoneWidth).max,layout.boardLeft+layout.boardWidth);
  }
});
