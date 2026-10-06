#!/usr/bin/env node
import { record, stateDirectory } from './state.js';

// The host supplies JSON on stdin. Consume it locally, select only lifecycle
// fields, and never log or send the raw payload to the game API.
try {
  let raw = '', size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error('Hook input too large');
    raw += chunk;
  }
  const { session_id, turn_id, hook_event_name, cwd, agent_id } = JSON.parse(raw);
  raw = '';
  if (typeof cwd === 'string' && cwd.length <= 4096)
    await record(stateDirectory(cwd), { session_id, turn_id, hook_event_name, agent_id });
} catch { /* Advisory only. Missing state makes the launcher refuse/stop play. */ }
// No allow/deny decision, prompt context, or turn continuation instruction.
process.stdout.write('{}\n');
