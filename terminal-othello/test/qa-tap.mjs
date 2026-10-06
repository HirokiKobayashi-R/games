// Test-only: observe incoming states, never URLs, headers or session tokens.
import { appendFileSync, readFileSync } from 'node:fs';
let current;
const NativeWebSocket = globalThis.WebSocket;
globalThis.WebSocket = class extends NativeWebSocket {
  send(data) {
    // Never let a test move reach an unconfirmed public opponent.
    const message = data === 'ping' ? null : JSON.parse(data);
    if (message?.type === 'move' && readFileSync(process.env.OTHELLO_QA_GAME, 'utf8') !== message.game) return;
    super.send(data);
  }
  constructor(...args) {
    super(...args); current = this;
    this.addEventListener('message', ({data}) => {
      if (data === 'pong') return;
      const message = JSON.parse(data);
      if (['state', 'error'].includes(message.type)) appendFileSync(process.env.OTHELLO_QA_LOG, JSON.stringify(message) + '\n', {mode:0o600});
    });
  }
};
process.on('SIGUSR2', () => current?.close());
