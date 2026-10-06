#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { playable, readState, stateDirectory, workingSessions } from './state.js';

const args = process.argv.slice(2);
const watch = args.includes('--watch');
if (args.some(x => x !== '--watch')) { console.error('Usage: launch.js [--watch]'); process.exit(1); }
if (!process.stdin.isTTY || !process.stdout.isTTY) { console.error('Codex の内蔵ターミナルから起動してください。'); process.exit(1); }

let selected;
if (watch) {
  const sessions = await workingSessions(stateDirectory(process.cwd()));
  if (!sessions.length) {
    console.log('監視できる作業がありません。ローカル Codex の hooks をレビュー・信頼し、同じプロジェクトで作業を開始してください。');
    console.log('クラウド親タスクの状態はローカル hooks では検出できません。通常の「オセロ」は独立して起動できます。');
    process.exit(1);
  }
  if (sessions.length === 1) selected = sessions[0];
  else {
    console.log('同じプロジェクトで複数の作業が動いています。監視する作業を選択:');
    sessions.forEach((s, i) => console.log(`${i + 1}: ${s.session.slice(0, 8)} / 更新 ${new Date(s.updated).toLocaleTimeString()}`));
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const choice = await rl.question('番号 (その他はキャンセル): '); rl.close();
    if (!/^[1-9]\d*$/.test(choice) || !sessions[Number(choice) - 1]) process.exit(0);
    selected = sessions[Number(choice) - 1];
  }
  // Recheck after selection so an approval that arrived while choosing wins.
  let current;
  try { current = await readState(selected.path); } catch {}
  if (!playable(current) || current.turn !== selected.turn) { console.log('作業状態が変わりました。Codex に戻ってください。'); process.exit(0); }
}

const child = spawn(process.execPath, [fileURLToPath(new URL('../client.js', import.meta.url)),
  '--url', process.env.OTHELLO_URL || 'https://terminal-othello.hiroki-c3a.workers.dev'], { stdio: 'inherit' });
let timer, forceTimer, stopping = false, reason = '';
function stop(message) {
  if (stopping) return;
  stopping = true; reason = message; clearInterval(timer);
  child.kill('SIGTERM'); // Own child only: cancel/resign, wait for ACK, restore TTY.
  forceTimer = setTimeout(() => child.kill('SIGKILL'), 2500);
}
const labels = { approval: '承認が必要です', done: '作業が完了しました', interrupted: '作業が中断されました', ended: 'セッションが終了しました' };
if (watch) timer = setInterval(async () => {
  try {
    const current = await readState(selected.path);
    if (current.turn !== selected.turn) stop('監視していた作業が切り替わりました');
    else if (!playable(current)) stop(labels[current.status] || '作業状態を確認できません');
  } catch { stop('作業状態を確認できません'); }
}, 250);
process.on('SIGINT', () => stop('オセロを終了しました'));
process.on('SIGTERM', () => stop('オセロを終了しました'));
child.on('error', () => { reason = 'オセロを起動できませんでした'; });
child.on('close', code => {
  clearInterval(timer); clearTimeout(forceTimer);
  // Also restore if a stuck child required SIGKILL. Never touch other processes.
  process.stdin.setRawMode(false); process.stdin.pause();
  process.stdout.write('\x1b[0m\x1b[?25h\x1b[?1049l');
  if (reason) console.log(`${reason}。対局を終了して Codex に戻りました。`);
  process.exitCode = stopping ? 0 : (code ?? 1);
});
