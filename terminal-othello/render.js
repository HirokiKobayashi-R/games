import { coordinate, legalMoves, score } from './rules.js';

export const stone = color => ['', '●', '○'][color];
export const fitsBoard = (columns, rows) => columns >= 40 && rows >= 22;

// Conservative widths for UI text. Board glyphs are independently anchored,
// so both one- and two-column ambiguous glyphs remain in their own cells.
export function clipText(text, columns) {
  let result = '', used = 0;
  for (const char of text) {
    const code = char.codePointAt(0);
    const width = /[●○·]/u.test(char) || code >= 0x1100 ? 2 : 1;
    if (used + width > columns) break;
    result += char; used += width;
  }
  return result;
}

// Animate only a single observed move, never a new game or a reconnect jump.
export function boardChange(before, after) {
  if (!before) return null;
  const placed = [], flipped = [];
  for (let i = 0; i < 64; i++) {
    if (before[i] === after[i]) continue;
    if (!after[i]) return null;
    (before[i] ? flipped : placed).push(i);
  }
  if (placed.length !== 1 || !flipped.length || flipped.some(i => after[i] !== after[placed[0]])) return null;
  return { placed: placed[0], flipped, before };
}

const paint = (text, code, color) => color ? `\x1b[${code}m${text}\x1b[0m` : text;
const at = col => `\x1b[${col}G`;

export function boardRows(board, moves, cursor, { color = 0, tall = false, last = -1, effect = null, phase = 3 } = {}) {
  const rows = [];
  const edge = paint('   +' + '-'.repeat(32) + '+', color >= 8 ? '38;5;65' : '32', color);
  rows.push('     a   b   c   d   e   f   g   h', edge);
  for (let y = 0; y < 8; y++) {
    let row = ` ${y + 1} |`, shadow = '   |';
    for (let x = 0; x < 8; x++) {
      const cell = y * 8 + x, active = cursor === cell;
      const turning = effect?.flipped.includes(cell) && phase < 3;
      const value = turning && phase === 0 ? effect.before[cell] : board[cell];
      const mark = turning && phase === 1 ? '|' : stone(value) || (moves.has(cell) ? '+' : '·');
      const bg = color >= 8 ? `48;5;${active ? 100 : (x + y) % 2 ? 28 : 22}` : active ? '43' : '42';
      const fg = color >= 8 ? `38;5;${turning ? 229 : value === 1 ? 232 : value === 2 ? 231 : 151}` : value === 1 ? '30' : '97';
      // Fill first, then position the glyph; ambiguous width cannot leave holes.
      row += at(5 + x * 4) + paint('    ', bg, color) + at(5 + x * 4) +
        paint(active ? `[${mark}]` : cell === last ? `<${mark}>` : ` ${mark}`, `${bg};${fg};1`, color);
      shadow += at(5 + x * 4) + paint(value ? ' __ ' : '    ', `${bg};${color >= 8 ? '38;5;22' : '30'}`, color);
    }
    rows.push(row + at(37) + '|');
    if (tall) rows.push(shadow + at(37) + '|');
  }
  rows.push(edge);
  return rows;
}

export function renderScreen({ game, remote = false, color: player = 1, opponentOnline = true,
  online = false, searching = true, cursor = 19, typed = '', note = '', last = -1, effect = null, phase = 3,
  columns = 80, rows = 24, colors = 0 }) {
  const width = Math.max(0, columns - 1);
  const text = (value, style = '') => paint(clipText(value, width), style, colors && style);
  if (!fitsBoard(columns, rows)) {
    return ['TERMINAL OTHELLO', 'Resize to 40 x 22 to play.', 'q: quit / m: cancel search', `${columns} x ${rows}`]
      .slice(0, Math.max(1, rows - 1)).map(line => text(line));
  }
  const count = score(game.board), moves = new Set(game.ended ? [] : legalMoves(game.board, game.turn));
  const mode = remote ? `対人戦 / あなた ${stone(player)} ${player === 1 ? '黒' : '白'}` : 'CPU 練習 / あなた ● 黒';
  const network = !online ? '再接続中' : remote && !opponentOnline && !game.ended ? '相手の復帰待ち (2 分)' :
    remote ? 'オンライン・対戦中' : searching ? 'オンライン・検索 ON' : 'オンライン・検索 OFF';
  const lines = [text('  TERMINAL OTHELLO', '1;97'), '', text(mode),
    text(`● ${String(count.black).padStart(2)} : ○ ${String(count.white).padStart(2)}   / ${64 - count.black - count.white} empty`, '1;97'),
    text(network, '36'), ''];
  lines.push(...boardRows(game.board, moves, cursor, { color: colors, tall: rows >= 30, last, effect, phase }));
  if (game.ended) {
    const winner = remote ? game.winner : count.black === count.white ? 0 : count.black > count.white ? 1 : 2;
    const reason = { cancelled: '相手のキャンセル', disconnected: '切断時間切れ', inactive: '30 分間着手なし', scored: '終局' }[game.reason] || '終局';
    lines.push(text(`${winner === 0 ? '引き分け' : winner === player ? 'あなたの勝ち' : 'あなたの負け'} / ${reason}`, '1;33'));
  } else lines.push(text(`手番: ${stone(game.turn)} ${game.turn === 1 ? '黒' : '白'}${game.passed ? ' / 自動パス' : ''}`, '1;97'));
  lines.push(text(note), text(`[${typed || coordinate(cursor)}] Enter: 着手  +:合法手  <>:最終手`),
    text('m:検索/投了 n:CPU新盤面 r:次 q:終了'));
  return lines;
}
