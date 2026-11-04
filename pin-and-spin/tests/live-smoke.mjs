// Opt-in integration test. Creates a disposable ten-player room on Game DB,
// then releases every seat. No service credential or existing room is used.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const endpoint = 'https://eybzbtyfafmqbkulyvog.supabase.co/functions/v1/pin-and-spin';
const players = Array.from({ length: 10 }, (_, i) => ({ token: randomBytes(32).toString('hex'), name: `QA ${i + 1}` }));
let code;
async function call(player, action, data = {}) {
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: player.token, code: code || '', action, data }),
    signal: AbortSignal.timeout(15000),
  });
  const state = await response.json();
  if (!response.ok || state.error) throw new Error(state.error || 'Request failed');
  return state;
}
try {
  let state = await call(players[0], 'create', { name: players[0].name, mode: 'reveal' });
  code = state.code;
  console.log(`Test room: ${code}`);
  await Promise.all(players.slice(1).map(p => call(p, 'join', { name: p.name })));
  await Promise.all(players.slice(1).map(p => call(p, 'ready', { ready: true })));
  state = await call(players[0], 'start');
  assert.equal(state.players.length, 10);
  assert.equal(state.answer, null);
  const guess = { colors: [0, 1, 2, 5], attempt: 1, puzzle: state.puzzle };
  await Promise.all([call(players[0], 'guess', guess), call(players[0], 'guess', guess)]);
  state = await call(players[1], 'state');
  assert.equal(state.guesses.length, 0, 'Private guess must stay hidden');
  await Promise.all(players.slice(1).map(p => call(p, 'guess', guess)));
  state = await call(players[0], 'state');
  assert.equal(state.guesses.length, 10, 'Duplicate submissions must not create extra guesses');
  assert.ok(state.guesses.every(g => g.revealed && g.attempt === 1));
  assert.ok(state.status === 'finished' || state.round === 2, 'Round must advance exactly once');
  await assert.rejects(call({ token: randomBytes(32).toString('hex') }, 'state'), /seat/);
  console.log('PASS: ten concurrent players, private submissions, duplicate protection, atomic reveal, invalid-session rejection');
} finally {
  if (code) {
    for (const p of players) {
      try { await call(p, 'leave'); } catch { /* A test may fail before this player joins. */ }
    }
  }
}
