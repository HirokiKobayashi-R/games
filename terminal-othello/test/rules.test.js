import test from 'node:test';
import assert from 'node:assert/strict';
import { initialGame, flips, legalMoves, play, cpuMove, score, parseCoordinate, coordinate } from '../rules.js';

test('opening, coordinates and immutable legal move', () => {
  const g = initialGame();
  assert.deepEqual(legalMoves(g.board, 1), [19, 26, 37, 44]);
  const next = play(g, 1, 19);
  assert.equal(g.board[19], 0); assert.equal(next.board[27], 1);
  assert.deepEqual(score(next.board), { black: 4, white: 1 });
  for (let cell = 0; cell < 64; cell++) assert.equal(parseCoordinate(coordinate(cell)), cell);
  assert.equal(parseCoordinate('a9'), -1);
  for (const cell of [-1, 64, 3.5, null, '19', 27, 0]) assert.throws(() => play(g, 1, cell));
  assert.throws(() => play(g, 2, 20));
});

test('captures all eight directions without wrapping board edges', () => {
  const board = Array(64).fill(0);
  for (const d of [-9, -8, -7, -1, 1, 7, 8, 9]) { board[27 + d] = 2; board[27 + d * 2] = 1; }
  assert.equal(flips(board, 1, 27).length, 8);
  const edge = Array(64).fill(0); edge[8] = 2; edge[9] = 1;
  assert.deepEqual(flips(edge, 1, 7), []);
});

test('CPU completes 30 legal games; pass and scoring terminate correctly', () => {
  let seed = 42, passes = 0;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let n = 0; n < 30; n++) {
    let g = initialGame(), turns = 0;
    while (!g.ended) {
      const cell = cpuMove(g, random);
      assert.ok(legalMoves(g.board, g.turn).includes(cell));
      const next = play(g, g.turn, cell);
      if (next.passed && !next.ended) {
        passes++; assert.equal(legalMoves(next.board, next.passed).length, 0);
        assert.ok(legalMoves(next.board, next.turn).length);
      }
      g = next; assert.ok(++turns <= 60);
    }
    assert.equal(legalMoves(g.board, 1).length + legalMoves(g.board, 2).length, 0);
    assert.throws(() => play(g, 1, 0));
  }
  assert.ok(passes > 0);
});
