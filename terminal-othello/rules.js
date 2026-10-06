export function initialGame() {
  const board = Array(64).fill(0);
  board[27] = board[36] = 2;
  board[28] = board[35] = 1;
  return { board, turn: 1, revision: 0, ended: false, passed: 0 };
}

export function flips(board, color, cell) {
  if (!Number.isInteger(cell) || cell < 0 || cell >= 64 || board[cell]) return [];
  const result = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const line = [];
    let x = cell % 8 + dx, y = Math.floor(cell / 8) + dy;
    while (x >= 0 && x < 8 && y >= 0 && y < 8 && board[y * 8 + x] === 3 - color) {
      line.push(y * 8 + x); x += dx; y += dy;
    }
    if (x >= 0 && x < 8 && y >= 0 && y < 8 && board[y * 8 + x] === color) result.push(...line);
  }
  return result;
}

export function legalMoves(board, color) {
  return board.flatMap((_, cell) => flips(board, color, cell).length ? [cell] : []);
}

export function score(board) {
  return { black: board.filter(x => x === 1).length, white: board.filter(x => x === 2).length };
}

export function play(game, color, cell) {
  if (game.ended || game.turn !== color) throw new Error('手番が違います');
  const captured = flips(game.board, color, cell);
  if (!captured.length) throw new Error('合法手ではありません');
  const board = [...game.board];
  for (const i of [cell, ...captured]) board[i] = color;
  let turn = 3 - color, passed = 0;
  if (!legalMoves(board, turn).length) { passed = turn; turn = color; }
  const ended = !legalMoves(board, turn).length;
  return { board, turn: ended ? 0 : turn, revision: game.revision + 1, passed, ended };
}

// Small, local-only CPU: prefer corners, then mobility and captured discs.
export function cpuMove(game, random = Math.random) {
  const moves = legalMoves(game.board, game.turn);
  const rated = moves.map(cell => {
    const next = play(game, game.turn, cell);
    const corner = [0, 7, 56, 63].includes(cell) ? 100 : 0;
    return { cell, value: corner + flips(game.board, game.turn, cell).length -
      legalMoves(next.board, 3 - game.turn).length * 2 + random() };
  });
  return rated.sort((a, b) => b.value - a.value)[0]?.cell;
}

export const coordinate = cell => 'abcdefgh'[cell % 8] + (Math.floor(cell / 8) + 1);
export const parseCoordinate = text => /^[a-h][1-8]$/i.test(text)
  ? (Number(text[1]) - 1) * 8 + text.toLowerCase().charCodeAt(0) - 97 : -1;
