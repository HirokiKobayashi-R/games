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

// Odd/even cell width follows the configured disc width. The leftover
// padding is always even: an ambiguous-width circle has the same center as its tile.
export function boardLayout(columns = 80, rows = 24, stoneWidth = 1) {
  const tall = rows >= 37 && columns >= 8 * (stoneWidth + 6) + 7;
  const spacious = columns >= 8 * (stoneWidth + 4) + 7;
  const cellWidth = stoneWidth + (tall ? 6 : spacious ? 4 : 2);
  const height = tall ? 3 : 1;
  const separators = !tall && rows >= 30;
  const boardWidth = cellWidth * 8 + 5;
  return { cellWidth, height, separators, left: Math.max(0, Math.floor((columns - boardWidth - 1) / 2)), boardWidth };
}

export function boardRows(board, moves, cursor, { color = 0, last = -1, effect = null, phase = 3,
  columns = 80, rows = 24, stoneWidth = 1 } = {}) {
  const layout = boardLayout(columns, rows, stoneWidth);
  const { cellWidth, height, separators, left } = layout;
  const result = [], start = left + 5, center = (cellWidth - stoneWidth) / 2;
  const frameStyle = color >= 8 ? '38;5;65' : '32';
  const edge = ' '.repeat(left) + paint('   +' + '-'.repeat(cellWidth * 8) + '+', frameStyle, color);
  let labels = '';
  for (let x = 0; x < 8; x++) labels += at(start + x * cellWidth + center) + paint('abcdefgh'[x], '2;37', color);
  result.push(labels, edge);
  for (let y = 0; y < 8; y++) {
    for (let subrow = 0; subrow < height; subrow++) {
      const middle = subrow === Math.floor(height / 2);
      let line = ' '.repeat(left) + (middle ? ` ${y + 1} |` : '   |');
      for (let x = 0; x < 8; x++) {
        const cell = y * 8 + x, active = cursor === cell;
        const turning = effect?.flipped.includes(cell) && phase < 3;
        const value = turning && phase === 0 ? effect.before[cell] : board[cell];
        const bg = color >= 8 ? `48;5;${active ? 58 : (x + y) % 2 ? 29 : 22}` : active ? '43' : '42';
        const fg = color >= 8 ? `38;5;${turning ? 229 : value === 1 ? 16 : value === 2 ? 231 : 151}` : value === 1 ? '30' : '97';
        const col = start + x * cellWidth;
        const disc = value && !(turning && phase === 1);
        const face = color >= 8 ? `48;5;${value === 1 ? 233 : 253}` : value === 1 ? '40' : '47';
        line += at(col) + paint(' '.repeat(cellWidth), bg, color);
        if (middle) {
          const mark = turning && phase === 1 ? '|'.repeat(stoneWidth) : stone(value) || (moves.has(cell) ? '+'.repeat(stoneWidth) : ' '.repeat(stoneWidth));
          if (disc) {
            const inset = height === 3 ? 2 : 1;
            if (color) line += at(col + center - inset) + paint(' '.repeat(stoneWidth + inset * 2), face, color);
            else line += at(col + center - inset) + '(' + at(col + center + stoneWidth + inset - 1) + ')';
          }
          const discFg = color >= 8 ? value === 1 ? '38;5;250' : '38;5;238' : value === 1 ? '97' : '30';
          line += at(col + center) + paint(mark, `${disc && color ? face : bg};${disc && color && !turning ? discFg : fg};1`, color);
          if (active || cell === last) line += at(col) + paint(active ? '[' : '<', `${bg};1;93`, color) +
            at(col + cellWidth - 1) + paint(active ? ']' : '>', `${bg};1;93`, color);
        } else if (disc) {
          const cap = subrow === 0 ? '.' + '-'.repeat(stoneWidth) + '.' : "'" + '-'.repeat(stoneWidth) + "'";
          const shade = color >= 8 ? `38;5;${subrow === 0 ? value === 1 ? 240 : 255 : value === 1 ? 232 : 245}` : subrow === 0 ? value === 1 ? '90' : '97' : value === 1 ? '30' : '37';
          // Half-block caps keep the visible bevel symmetric around the middle
          // row. These ambiguous glyphs follow the same width setting as discs.
          const bevel = (subrow === 0 ? '▄' : '▀').repeat((stoneWidth + 2) / stoneWidth);
          line += at(col + center - 1) + (color ? paint(bevel, `${bg};${shade}`, color) : cap);
        }
      }
      result.push(line + at(start + cellWidth * 8) + paint('|', frameStyle, color));
    }
    if (separators && y < 7) result.push(' '.repeat(left) + paint('   |' + Array(8).fill('-'.repeat(cellWidth)).join('') + '|', color >= 8 ? '38;5;23' : '2;32', color));
  }
  result.push(edge);
  return result;
}

export function renderScreen({ game, remote = false, color: player = 1, opponentOnline = true,
  online = false, searching = true, cursor = 19, typed = '', note = '', last = -1, effect = null, phase = 3,
  columns = 80, rows = 24, colors = 0, stoneWidth = 1 }) {
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
  const left = boardLayout(columns, rows, stoneWidth).left;
  const panel = (value, style = '') => text(' '.repeat(left) + value, style);
  const lines = [panel('TERMINAL OTHELLO', '1;97'), panel(mode),
    panel(`● ${String(count.black).padStart(2)} : ○ ${String(count.white).padStart(2)}   / ${64 - count.black - count.white} empty`, '1;97'),
    panel(network, '36'), ''];
  lines.push(...boardRows(game.board, moves, cursor, { color: colors, columns, rows, stoneWidth, last, effect, phase }));
  if (game.ended) {
    const winner = remote ? game.winner : count.black === count.white ? 0 : count.black > count.white ? 1 : 2;
    const reason = { cancelled: '相手のキャンセル', disconnected: '切断時間切れ', inactive: '30 分間着手なし', scored: '終局' }[game.reason] || '終局';
    lines.push(panel(`${winner === 0 ? '引き分け' : winner === player ? 'あなたの勝ち' : 'あなたの負け'} / ${reason}`, '1;33'));
  } else lines.push(panel(`手番: ${stone(game.turn)} ${game.turn === 1 ? '黒' : '白'}${game.passed ? ' / 自動パス' : ''}`, '1;97'));
  lines.push(panel(note), panel(`[${typed || coordinate(cursor)}] Enter: 着手  +:合法手  <>:最終手`),
    panel('m:検索/投了 n:CPU新盤面 r:次 q:終了'));
  return lines;
}
