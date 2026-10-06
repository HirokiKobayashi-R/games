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

// One visual system, with a 256-color fallback for macOS Terminal. Half blocks
// provide two square-ish pixels per character; no image protocol or font install.
const palette = {
  ink: [17, 25, 29], card: [30, 40, 44], board: [43, 56, 54], grid: [49, 63, 60],
  text: [231, 236, 228], muted: [133, 155, 151], mint: [150, 213, 179], gold: [219, 190, 133]
};
const at = column => `\x1b[${column}G`;
const mix = (a, b, t) => a.map((v, i) => Math.round(v * (1 - t) + b[i] * t));
const clamp = n => Math.max(0, Math.min(1, n));
const ansiCache = new Map();
function colorCode(rgb, background, depth) {
  const key = `${rgb}/${background}/${depth}`;
  if (ansiCache.has(key)) return ansiCache.get(key);
  let code;
  if (depth >= 24) code = `${background ? 48 : 38};2;${rgb.join(';')}`;
  else {
    const levels = [0, 95, 135, 175, 215, 255];
    const nearest = rgb.map(v => levels.reduce((best, n, i) => Math.abs(n - v) < Math.abs(levels[best] - v) ? i : best, 0));
    const gray = Math.max(0, Math.min(23, Math.round((rgb.reduce((a, b) => a + b) / 3 - 8) / 10)));
    const error = candidate => rgb.reduce((sum, v, i) => sum + (v - candidate[i]) ** 2, 0);
    const index = error([gray * 10 + 8, gray * 10 + 8, gray * 10 + 8]) < error(nearest.map(i => levels[i])) ?
      232 + gray : 16 + nearest[0] * 36 + nearest[1] * 6 + nearest[2];
    code = `${background ? 48 : 38};5;${index}`;
  }
  ansiCache.set(key, code);
  return code;
}
const styled = (text, fg, bg, depth, bold = false) => !depth ? text :
  `\x1b[${depth < 8 ? `${bold ? '1;' : ''}37;40` : `${colorCode(fg, false, depth)};${colorCode(bg, true, depth)}${bold ? ';1' : ''}`}m${text}\x1b[0m`;

export function boardLayout(columns = 80, rows = 24, stoneWidth = 1, colors = 8) {
  const graphic = colors >= 8 && rows >= 30 && columns >= 54;
  const large = graphic && rows >= 47 && columns >= 78;
  const height = graphic ? large ? 4 : rows >= 39 && columns >= 62 ? 3 : 2 : 1;
  const cellWidth = graphic ? large ? 8 : 6 : stoneWidth + (columns >= 58 ? 4 : 2);
  const panelWidth = Math.min(columns - 1, cellWidth * 8 + 8);
  const left = Math.max(0, Math.floor((columns - 1 - panelWidth) / 2));
  return { graphic, cellWidth, height, panelWidth, left, boardLeft: left + 4, boardWidth: cellWidth * 8 };
}

// Sample a disc geometrically rather than assembling a cross-shaped character.
// Exported for geometry/contrast tests; the same raster is used by the terminal.
export function tilePixel(x, y, { width, height, value, selected = false, legal = false, last = false, squash = 1 }) {
  const centerX = width / 2, centerY = height / 2;
  let bg = selected ? mix(palette.board, palette.mint, .13) : palette.board;
  if (x < .6 || y < .6) bg = palette.grid;
  if (selected && ((x < .6 || x > width - .6) && (y < 1.6 || y > height - 1.6) ||
      (y < .6 || y > height - .6) && (x < 1.6 || x > width - 1.6))) bg = palette.mint;
  const radius = Math.min(width, height) * .37;
  const dx = (x - centerX) / squash, dy = y - centerY;
  const distance = Math.hypot(dx, dy);
  if (value) {
    const coverage = clamp(radius + .5 - distance);
    const light = clamp(.55 - dy / (radius * 3) - dx / (radius * 7));
    let face = value === 1 ? mix([10, 17, 21], [30, 41, 44], light) : mix([221, 230, 216], [255, 254, 239], light);
    if (value === 1 && dy < 0) face = mix(face, [92, 113, 110], clamp(distance / radius - .65) * .5);
    bg = mix(bg, face, coverage);
  } else if (legal) {
    const coverage = clamp(1.25 - distance);
    bg = mix(bg, palette.mint, coverage * (selected ? .85 : .6));
  }
  if (last && x > width - 1.5 && y > height - 1.5) bg = palette.gold;
  return bg;
}

// Pick the best two-color quadrant block for four samples. Quadrants improve
// circular edges without an image protocol; half blocks remain a subset.
const blocks = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█';
function rasterBlock(samples, depth) {
  let best, error = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const groups = [[], []];
    samples.forEach((rgb, i) => groups[(mask >> i) & 1].push(rgb));
    const means = groups.map(group => group.length ? [0, 1, 2].map(c => Math.round(group.reduce((n, rgb) => n + rgb[c], 0) / group.length)) : samples[0]);
    const distance = samples.reduce((n, rgb, i) => n + rgb.reduce((m, v, c) => m + (v - means[(mask >> i) & 1][c]) ** 2, 0), 0);
    if (distance < error) { error = distance; best = { mask, means }; }
  }
  return { mark: blocks[best.mask], code: colorCode(best.means[1], false, depth) + ';' + colorCode(best.means[0], true, depth) };
}

export function boardRows(board, moves, cursor, { color = 0, last = -1, effect = null, phase = 3,
  columns = 80, rows = 24, stoneWidth = 1 } = {}) {
  const layout = boardLayout(columns, rows, stoneWidth, color);
  const { cellWidth, height, boardLeft, graphic } = layout;
  const ink = (text, fg = palette.muted, bg = palette.ink) => styled(text, fg, bg, color);
  let labels = '';
  for (let x = 0; x < 8; x++) labels += at(boardLeft + x * cellWidth + Math.floor(cellWidth / 2) + 1) + ink('abcdefgh'[x]);
  const result = [labels];
  for (let y = 0; y < 8; y++) for (let subrow = 0; subrow < height; subrow++) {
    let line = at(boardLeft - 1) + ink(subrow === Math.floor(height / 2) ? String(y + 1) : ' ');
    for (let x = 0; x < 8; x++) {
      const cell = y * 8 + x, turning = effect?.flipped.includes(cell) && phase < 3;
      const value = turning && phase === 0 ? effect.before[cell] : board[cell];
      const selected = cursor === cell, col = boardLeft + x * cellWidth + 1;
      line += at(col);
      if (graphic) {
        let previous = '';
        for (let px = 0; px < cellWidth; px += stoneWidth) {
          const options = { width: cellWidth, height: height * 2, value, selected, legal: moves.has(cell), last: last === cell,
            squash: turning ? phase === 1 ? .22 : phase === 2 ? .65 : 1 : 1 };
          const samples = [0, 1, 2, 3].map(i => tilePixel(px + stoneWidth * (i % 2 ? .75 : .25), subrow * 2 + (i < 2 ? .5 : 1.5), options));
          const { code, mark } = rasterBlock(samples, color);
          if (code !== previous) { line += `\x1b[${code}m`; previous = code; }
          line += mark === ' ' ? ' '.repeat(stoneWidth) : mark;
        }
        line += '\x1b[0m';
      } else {
        const bg = selected ? palette.grid : palette.board;
        line += ink(' '.repeat(cellWidth), palette.text, bg);
        const mark = turning && phase === 1 ? '|'.repeat(stoneWidth) : stone(value) || (moves.has(cell) ? '+'.repeat(stoneWidth) : ' '.repeat(stoneWidth));
        line += at(col + (cellWidth - stoneWidth) / 2) + ink(mark, value === 1 ? palette.muted : palette.text, bg);
        if (selected || last === cell) line += at(col) + ink(selected ? '[' : '<', palette.mint, bg) +
          at(col + cellWidth - 1) + ink(selected ? ']' : '>', palette.mint, bg);
      }
    }
    result.push(line);
  }
  return result;
}

export function renderScreen({ game, remote = false, color: player = 1, opponentOnline = true,
  online = false, searching = true, cursor = 19, typed = '', note = '', last = -1, effect = null, phase = 3,
  columns = 80, rows = 24, colors = 0, stoneWidth = 1 }) {
  const width = Math.max(0, columns - 1);
  if (!fitsBoard(columns, rows)) return ['OTHELLO', 'Resize to 40 x 22 to play.', 'q: quit / m: cancel search', `${columns} x ${rows}`]
    .slice(0, Math.max(1, rows - 1)).map(line => clipText(line, width));
  const { left, panelWidth, height } = boardLayout(columns, rows, stoneWidth, colors);
  const roomy = height > 1, contentWidth = panelWidth - 2;
  const p = (value, fg = palette.text, bg = palette.ink, bold = false) => styled(value, fg, bg, colors, bold);
  const panel = (value, fg, bg, bold) => at(left + 2) + p(clipText(value, contentWidth), fg, bg, bold);
  const blank = '';
  const count = score(game.board), moves = new Set(game.ended ? [] : legalMoves(game.board, game.turn));
  const mine = game.turn === player, finished = game.ended;
  const state = finished ? 'FINISHED' : !online ? 'OFFLINE' : remote ? opponentOnline || finished ? 'LIVE' : 'RECONNECT' : searching ? 'SEARCHING' : 'PAUSED';
  const mode = remote ? `対人戦 / TABLE ${(game.id || '').slice(0, 8)}` : searching ? 'CPU 練習 / 相手を検索中' : 'CPU 練習 / 検索 OFF';
  const rowsOut = [];
  if (height >= 3) rowsOut.push(blank);
  rowsOut.push(panel('O T H E L L O', palette.text, palette.ink, true) +
    at(left + panelWidth - state.length - 1) + p(state, online ? palette.mint : palette.muted));
  rowsOut.push(panel(mode, palette.muted));
  if (roomy) rowsOut.push(blank);
  const cardWidth = Math.floor((contentWidth - 2) / 2), second = left + cardWidth + 4;
  const card = (text, active) => p((' ' + text).padEnd(cardWidth), active ? palette.mint : palette.muted, palette.card);
  rowsOut.push(at(left + 2) + card(player === 1 ? 'BLACK / YOU' : 'BLACK / RIVAL', game.turn === 1) +
    at(second) + card(player === 2 ? 'WHITE / YOU' : remote ? 'WHITE / RIVAL' : 'WHITE / CPU', game.turn === 2));
  rowsOut.push(at(left + 2) + p(` ● ${String(count.black).padStart(2, '0')}  `.padEnd(cardWidth - stoneWidth + 1), palette.text, palette.card, true) +
    at(second) + p(` ○ ${String(count.white).padStart(2, '0')}  `.padEnd(cardWidth - stoneWidth + 1), palette.text, palette.card, true));
  const bar = active => colors >= 8 ? p('▀'.repeat(Math.floor(cardWidth / stoneWidth)) + ' '.repeat(cardWidth % stoneWidth), active ? palette.mint : palette.card, palette.card) : ' '.repeat(cardWidth);
  rowsOut.push(at(left + 2) + bar(game.turn === 1) + at(second) + bar(game.turn === 2));
  rowsOut.push(blank);
  rowsOut.push(...boardRows(game.board, moves, cursor, { color: colors, columns, rows, stoneWidth, last, effect, phase }));
  rowsOut.push(blank);
  let headline;
  if (finished) {
    const winner = remote ? game.winner : count.black === count.white ? 0 : count.black > count.white ? 1 : 2;
    headline = winner === 0 ? 'DRAW / 引き分け' : winner === player ? 'YOU WIN / あなたの勝ち' : 'YOU LOSE / あなたの負け';
  } else headline = remote && !opponentOnline ? '相手の復帰を待っています' :
    `${mine ? 'YOUR TURN / あなたの手番' : remote ? 'RIVAL TURN / 相手の手番' : 'CPU TURN / CPUの手番'}${game.passed ? ' / パス' : ''}`;
  rowsOut.push(panel(headline, finished ? palette.gold : mine ? palette.mint : palette.text, palette.ink, true));
  const reason = { cancelled: '相手の退出で対局終了', disconnected: '復帰時間切れで対局終了', inactive: '時間切れで引き分け', scored: 'すべての着手を終えました' }[game.reason];
  const detail = remote && !opponentOnline ? '盤面は保持されています。復帰猶予は2分。' : note || (mine ? '次の一手を選んでください。' : '盤面は相手と同期しています。');
  rowsOut.push(panel(finished ? reason || '対局終了。r で次の対戦へ' : detail, palette.muted));
  rowsOut.push(panel(finished ? remote ? 'r:次の対戦  m:退出  q:終了' : 'n:CPU新盤面  r:対戦  q:終了' :
    `[${typed || coordinate(cursor)}] ` + (contentWidth < 38 ? 'Enter  m:検索  q:終了' : 'Enter:着手  m:検索/投了  q:終了'), palette.text));
  if (roomy) rowsOut.push(panel(finished ? '' : `合法手 ${moves.size}  /  ${64 - count.black - count.white} empty   ${remote ? '矢印:選択' : 'n:CPU新盤面'}`, palette.muted));
  // Paint the full frame so terminal themes cannot erase the intended contrast.
  return rowsOut.map(line => p(' '.repeat(width)) + at(1) + line + at(columns));
}
