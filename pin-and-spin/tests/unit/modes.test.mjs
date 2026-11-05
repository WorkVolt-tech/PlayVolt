// The four game modes and room rules, run against the real pin_and_spin_api SQL function.
// Each test gets a fresh in-memory database. Secrets are set directly so outcomes are known.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, game, rejects, tok } from './db.mjs';

const SECRET = [0, 1, 2, 3];
const WRONG = [5, 5, 5, 5];
let db, g;
beforeEach(async () => { db = await freshDb(); g = game(db); });

async function started(mode, count = 2) {
  const room = await g.room(mode, count);
  const state = await g.api('start', room.code, room.players[0].token);
  await g.setSecret(room.code, SECRET);
  return { ...room, state };
}
const guess = (room, player, colors, attempt, puzzle = 1) =>
  g.api('guess', room.code, player.token, { colors, attempt, puzzle });
const state = (room, player) => g.api('state', room.code, player.token);
const byId = (room, id) => room.players.find((p) => p.id === id);

describe('secrecy', () => {
  test('tables and the API are not reachable with public browser roles', async () => {
    for (const role of ['anon', 'authenticated']) {
      const { rows: [r] } = await db.query(`select
        has_table_privilege($1,'public.pin_and_spin_rooms','select') rooms,
        has_table_privilege($1,'public.pin_and_spin_guesses','select') guesses,
        has_function_privilege($1,'public.pin_and_spin_api(text,text,text,jsonb,text)','execute') api`, [role]);
      assert.deepEqual(r, { rooms: false, guesses: false, api: false }, role);
    }
  });

  test('the answer is never sent while the match is playing, then revealed at the end', async () => {
    const room = await started('rush');
    assert.equal(room.state.answer, null);
    assert.equal((await state(room, room.players[1])).answer, null);
    assert.equal((await guess(room, room.players[1], WRONG, 1)).answer, null);
    const end = await guess(room, room.players[0], SECRET, 1);
    assert.deepEqual(end.answer, SECRET);
  });

  test('the display link only reads, sees no sealed guesses, and cannot act', async () => {
    const room = await started('reveal');
    await guess(room, room.players[0], SECRET, 1);
    const shown = await g.api('display', room.code, room.display);
    assert.equal(shown.guesses.length, 0);
    assert.equal(shown.answer, null);
    assert.equal(shown.displayToken, null);
    await rejects(g.api('start', room.code, room.display));
  });

  test('a random token cannot read a room', async () => {
    const room = await started('classic');
    await rejects(g.api('state', room.code, tok(999)), /no longer in this room/);
  });
});

describe('Classic', () => {
  test('turns rotate, out-of-turn guesses are ignored, and feedback is public at once', async () => {
    const room = await started('classic', 3);
    const first = byId(room, room.state.turnId);
    const order = [...room.players.slice(room.players.indexOf(first)), ...room.players.slice(0, room.players.indexOf(first))];
    const outOfTurn = await guess(room, order[1], SECRET, 1);
    assert.equal(outOfTurn.guesses.length, 0, 'out-of-turn guess must not be accepted');
    assert.equal(outOfTurn.status, 'playing');
    let s = await guess(room, order[0], [0, 2, 4, 5], 1);
    assert.equal(s.turnId, order[1].id);
    const seen = await state(room, order[2]);
    assert.deepEqual(seen.guesses[0], { playerId: order[0].id, attempt: 1, colors: [0, 2, 4, 5], pins: 1, spins: 1, revealed: true });
    s = await guess(room, order[1], WRONG, 1);
    assert.equal(s.turnId, order[2].id);
  });

  test('the first player to solve wins and the match ends', async () => {
    const room = await started('classic', 3);
    const first = byId(room, room.state.turnId);
    const s = await guess(room, first, SECRET, 1);
    assert.equal(s.status, 'finished');
    assert.deepEqual(s.winners, [first.id]);
  });

  test('each player gets four guesses; the match ends with no winner when all are used', async () => {
    const room = await started('classic', 2);
    let s = room.state;
    for (let turn = 0; turn < 8; turn++) {
      const player = byId(room, s.turnId);
      const attempt = s.guesses.filter((x) => x.playerId === player.id).length + 1;
      s = await guess(room, player, WRONG, attempt);
    }
    assert.equal(s.status, 'finished');
    assert.deepEqual(s.winners, []);
    assert.deepEqual(s.answer, SECRET);
    assert.equal(s.guesses.length, 8);
  });

  test('a resent guess (double tap) is recorded once', async () => {
    const room = await started('classic', 2);
    const first = byId(room, room.state.turnId);
    await guess(room, first, WRONG, 1);
    const s = await guess(room, first, WRONG, 1);
    assert.equal(s.guesses.length, 1);
  });

  test('if the current player leaves, the turn passes on', async () => {
    const room = await started('classic', 3);
    const first = byId(room, room.state.turnId);
    await g.api('leave', room.code, first.token);
    const other = room.players.find((p) => p !== first);
    const s = await state(room, other);
    assert.notEqual(s.turnId, first.id);
    assert.equal(s.status, 'playing');
  });
});

describe('Reveal', () => {
  test('guesses stay sealed until everyone has submitted, then reveal together', async () => {
    const room = await started('reveal', 3);
    const [a, b, c] = room.players;
    let s = await guess(room, a, [0, 1, 4, 4], 1);
    assert.equal(s.guesses.length, 1, 'own sealed guess is visible to its owner');
    assert.equal(s.guesses[0].revealed, false);
    assert.equal(s.guesses[0].pins, null, 'no feedback before the reveal');
    assert.equal((await state(room, b)).guesses.length, 0, 'others cannot see it');
    assert.equal(s.players.find((p) => p.id === a.id).submitted, true, 'submission indicator is public');
    await guess(room, b, WRONG, 1);
    s = await guess(room, c, WRONG, 1);
    assert.equal(s.round, 2);
    assert.equal(s.guesses.length, 3);
    assert.ok(s.guesses.every((x) => x.revealed));
    assert.deepEqual(s.guesses.find((x) => x.playerId === a.id).pins, 2);
  });

  test('players who solve in the same reveal share the win', async () => {
    const room = await started('reveal', 3);
    const [a, b, c] = room.players;
    await guess(room, a, SECRET, 1);
    await guess(room, b, WRONG, 1);
    const s = await guess(room, c, SECRET, 1);
    assert.equal(s.status, 'finished');
    assert.deepEqual([...s.winners].sort(), [a.id, c.id].sort());
  });

  test('one guess per round, and only for the current round', async () => {
    const room = await started('reveal', 2);
    const [a] = room.players;
    await guess(room, a, WRONG, 1);
    let s = await guess(room, a, SECRET, 1);
    assert.equal(s.guesses.length, 1);
    assert.deepEqual(s.guesses[0].colors, WRONG, 'second submission must not replace the first');
    s = await guess(room, a, SECRET, 2);
    assert.equal(s.guesses.length, 1, 'cannot jump ahead to round 2');
  });

  test('after four rounds without a solve, the match ends with no winner', async () => {
    const room = await started('reveal', 2);
    let s;
    for (let round = 1; round <= 4; round++) {
      for (const p of room.players) s = await guess(room, p, WRONG, round);
    }
    assert.equal(s.status, 'finished');
    assert.deepEqual(s.winners, []);
    assert.deepEqual(s.answer, SECRET);
  });

  test('a player leaving no longer blocks the reveal', async () => {
    const room = await started('reveal', 3);
    const [a, b, c] = room.players;
    await guess(room, a, WRONG, 1);
    await guess(room, b, WRONG, 1);
    await g.api('leave', room.code, c.token);
    const s = await state(room, a);
    assert.equal(s.round, 2);
  });
});

describe('Timed Reveal', () => {
  test('starts a three-minute server timer', async () => {
    const room = await started('timed-reveal');
    const left = new Date(room.state.deadline) - new Date(room.state.serverTime);
    assert.ok(left > 179000 && left <= 180000, `timer was ${left}ms`);
  });

  test('when time expires the round reveals, missing players lose that guess, and a fresh timer starts', async () => {
    const room = await started('timed-reveal', 2);
    const [a, b] = room.players;
    await guess(room, a, [0, 1, 4, 4], 1);
    await g.expireDeadline(room.code);
    const s = await state(room, b);
    assert.equal(s.round, 2);
    const missed = s.guesses.find((x) => x.playerId === b.id);
    assert.equal(missed.colors, null, 'missed guess is recorded as empty');
    assert.equal(missed.revealed, true);
    assert.equal(s.guesses.find((x) => x.playerId === a.id).pins, 2);
    const left = new Date(s.deadline) - new Date(s.serverTime);
    assert.ok(left > 179000, 'fresh timer for the next round');
  });

  test('a guess that arrives after the deadline is not accepted', async () => {
    const room = await started('timed-reveal', 2);
    const [a] = room.players;
    await g.expireDeadline(room.code);
    const s = await guess(room, a, SECRET, 1);
    assert.equal(s.status, 'playing');
    assert.equal(s.round, 2);
    assert.equal(s.guesses.find((x) => x.playerId === a.id).colors, null);
    assert.deepEqual(s.winners, []);
  });

  test('revealing early when everyone submits before the timer', async () => {
    const room = await started('timed-reveal', 2);
    const [a, b] = room.players;
    await guess(room, a, SECRET, 1);
    const s = await guess(room, b, SECRET, 1);
    assert.equal(s.status, 'finished');
    assert.equal(s.winners.length, 2, 'shared win');
  });

  test('four expired rounds end the match with no winner', async () => {
    const room = await started('timed-reveal', 2);
    let s;
    for (let round = 1; round <= 4; round++) {
      await g.expireDeadline(room.code);
      s = await state(room, room.players[0]);
    }
    assert.equal(s.status, 'finished');
    assert.deepEqual(s.winners, []);
    assert.equal(s.deadline, null);
  });
});

describe('Rush', () => {
  test('players guess freely without waiting, and results are visible live', async () => {
    const room = await started('rush', 2);
    const [a, b] = room.players;
    await guess(room, a, WRONG, 1);
    await guess(room, a, [0, 5, 5, 5], 2);
    const s = await state(room, b);
    assert.equal(s.guesses.length, 2);
    assert.ok(s.guesses.every((x) => x.revealed && x.pins !== null));
  });

  test('eight guesses each; a ninth is rejected', async () => {
    const room = await started('rush', 2);
    const [a] = room.players;
    let s;
    for (let i = 1; i <= 8; i++) s = await guess(room, a, WRONG, i);
    s = await guess(room, a, SECRET, 9);
    assert.equal(s.guesses.filter((x) => x.playerId === a.id).length, 8);
    assert.equal(s.status, 'playing', 'other player still has guesses');
  });

  test('the first correct submission wins; later ones are not accepted', async () => {
    const room = await started('rush', 3);
    const [a, b] = room.players;
    await guess(room, a, WRONG, 1);
    let s = await guess(room, b, SECRET, 1);
    assert.deepEqual(s.winners, [b.id]);
    s = await guess(room, a, SECRET, 2);
    assert.deepEqual(s.winners, [b.id]);
    assert.equal(s.guesses.filter((x) => x.playerId === a.id).length, 1);
  });

  test('the whole match has one three-minute timer; a solve after it expires does not count', async () => {
    const room = await started('rush', 2);
    const left = new Date(room.state.deadline) - new Date(room.state.serverTime);
    assert.ok(left > 179000 && left <= 180000);
    await g.expireDeadline(room.code);
    const s = await guess(room, room.players[0], SECRET, 1);
    assert.equal(s.status, 'finished');
    assert.deepEqual(s.winners, []);
    assert.deepEqual(s.answer, SECRET);
  });

  test('the match ends when every player has used all eight guesses', async () => {
    const room = await started('rush', 2);
    let s;
    for (const p of room.players) for (let i = 1; i <= 8; i++) s = await guess(room, p, WRONG, i);
    assert.equal(s.status, 'finished');
    assert.deepEqual(s.winners, []);
  });
});

describe('rooms, reconnects and rematches', () => {
  test('rooms hold at most ten players', async () => {
    const room = await g.room('reveal', 10);
    await rejects(g.api('join', room.code, tok(50), { name: 'Eleven' }), /full/);
  });

  test('only the host starts, and only once everyone is ready', async () => {
    const room = await g.room('classic', 3);
    await rejects(g.api('start', room.code, room.players[1].token), /host/);
    await g.api('ready', room.code, room.players[2].token, { ready: false });
    await rejects(g.api('start', room.code, room.players[0].token), /ready/);
  });

  test('a solo host cannot start', async () => {
    const room = await g.room('classic', 1);
    await rejects(g.api('start', room.code, room.players[0].token), /two players/);
  });

  test('duplicate names are refused, and nobody can join after the match starts', async () => {
    const room = await g.room('classic', 2);
    await rejects(g.api('join', room.code, tok(60), { name: 'p1' }), /taken/);
    await g.api('start', room.code, room.players[0].token);
    await rejects(g.api('join', room.code, tok(61), { name: 'Late' }), /already started/);
  });

  test('refreshing or reconnecting with the saved token returns the same seat mid-match', async () => {
    const room = await started('reveal', 2);
    const [a] = room.players;
    await guess(room, a, [0, 0, 4, 4], 1);
    const again = await g.api('join', room.code, a.token, { name: a.name });
    assert.equal(again.me, a.id);
    assert.deepEqual(again.guesses[0].colors, [0, 0, 4, 4], 'own sealed guess survives a refresh');
  });

  test('the host leaving hands the room to the next player', async () => {
    const room = await g.room('classic', 3);
    await g.api('leave', room.code, room.players[0].token);
    const s = await state(room, room.players[1]);
    assert.equal(s.hostId, room.players[1].id);
  });

  test('a rematch uses a new secret and hides the previous match\'s guesses', async () => {
    const room = await started('rush', 2);
    const [a, b] = room.players;
    await guess(room, a, SECRET, 1);
    await rejects(g.api('replay', room.code, b.token), /host/);
    let s = await g.api('replay', room.code, a.token);
    assert.equal(s.status, 'lobby');
    await g.api('ready', room.code, b.token, { ready: true });
    s = await g.api('start', room.code, a.token);
    assert.equal(s.puzzle, 2);
    assert.equal(s.guesses.length, 0);
    assert.equal(s.answer, null);
    const old = await guess(room, b, WRONG, 1, 1);
    assert.equal(old.guesses.length, 0, 'a guess for the old puzzle is ignored');
  });
});

describe('host controls and presence', () => {
  const kick = (room, by, target) => g.api('kick', room.code, by.token, { playerId: target.id });
  const silence = (player, seconds) =>
    db.query(`update public.pin_and_spin_players set last_seen=now()-make_interval(secs=>$2) where id=$1`, [player.id, seconds]);

  test('only the host can remove a player, and not themselves', async () => {
    const room = await g.room('classic', 3);
    const [host, b, c] = room.players;
    await rejects(kick(room, b, c), /Only the host/);
    await rejects(kick(room, host, host), /Leave Room/);
    const s = await kick(room, host, c);
    assert.deepEqual(s.players.filter((p) => p.active).map((p) => p.id), [host.id, b.id]);
  });

  test('a removed player is told so and cannot rejoin', async () => {
    const room = await g.room('reveal', 3);
    const [host, , c] = room.players;
    await kick(room, host, c);
    await rejects(state(room, c), /removed you/);
    await rejects(g.api('join', room.code, c.token, { name: 'Again' }), /removed you/);
  });

  test('removing the player whose turn it is passes the Classic turn on', async () => {
    const room = await started('classic', 3);
    const host = room.players[0];
    let current = byId(room, room.state.turnId);
    if (current === host) current = byId(room, (await guess(room, host, WRONG, 1)).turnId);
    const s = await kick(room, host, current);
    assert.notEqual(s.turnId, current.id);
    assert.equal(s.status, 'playing');
  });

  test('removing the last player who has not submitted triggers the Reveal', async () => {
    const room = await started('reveal', 3);
    const [host, b, c] = room.players;
    await guess(room, host, WRONG, 1);
    await guess(room, b, WRONG, 1);
    const s = await kick(room, host, c);
    assert.equal(s.round, 2);
  });

  test('removing everyone else in Rush leaves the host playing alone, not stuck', async () => {
    const room = await started('rush', 2);
    const [host, b] = room.players;
    const s = await kick(room, host, b);
    assert.equal(s.status, 'playing');
    assert.equal((await guess(room, host, SECRET, 1)).status, 'finished');
  });

  test('players silent for 45 seconds show as away; any request clears it', async () => {
    const room = await g.room('classic', 2);
    const [host, b] = room.players;
    await silence(b, 50);
    let s = await state(room, host);
    assert.equal(s.players.find((p) => p.id === b.id).away, true);
    assert.equal(s.players.find((p) => p.id === host.id).away, false);
    await state(room, b);
    s = await state(room, host);
    assert.equal(s.players.find((p) => p.id === b.id).away, false);
  });

  test('a host silent for 60 seconds hands the room to the next connected player', async () => {
    const room = await g.room('classic', 3);
    const [host, b, c] = room.players;
    await silence(host, 65);
    await silence(b, 65);
    const s = await state(room, c);
    assert.equal(s.hostId, c.id, 'skips players who are also away');
    await state(room, host);
    assert.equal((await state(room, host)).hostId, c.id, 'the old host returns as a player');
  });

  test('a host who is only briefly quiet keeps the room', async () => {
    const room = await g.room('classic', 2);
    const [host, b] = room.players;
    await silence(host, 30);
    assert.equal((await state(room, b)).hostId, host.id);
  });
});

describe('shared Domino login (migration 002)', () => {
  const ACCOUNT = '11111111-1111-4111-8111-111111111111';
  test('signed-in players use their Domino nickname and keep it after host controls run', async () => {
    await db.query(`insert into public.profiles(id,nickname) values($1,'DominoKing')`, [ACCOUNT]);
    const s = await g.api('create', '', tok(70), { name: 'ignored', mode: 'classic', _account_id: ACCOUNT });
    assert.equal(s.players[0].name, 'DominoKing');
    const again = await g.api('state', s.code, tok(70), { _account_id: ACCOUNT });
    assert.equal(again.me, s.me);
    await rejects(g.api('state', s.code, tok(70)), /ACCOUNT_REQUIRED/);
  });

  test('one account cannot take two seats in the same room', async () => {
    await db.query(`insert into public.profiles(id,nickname) values($1,'DominoKing')`, [ACCOUNT]);
    const s = await g.api('create', '', tok(71), { name: 'x', mode: 'reveal', _account_id: ACCOUNT });
    await rejects(g.api('join', s.code, tok(72), { name: 'y', _account_id: ACCOUNT }), /already has a seat/);
  });
});
