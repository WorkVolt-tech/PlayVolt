import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { freshDb, game, rejects } from './db.mjs';
import { GROUPS } from '../../src/cosmetics.js';
import { byCode } from '../../src/achievements.js';

const player = '00000000-0000-4000-8000-000000000001';
const friend = '00000000-0000-4000-8000-000000000002';

test('Mode trophies count only qualifying results and enforce all cosmetic locks', async t => {
  const db = await freshDb();
  t.after(() => db.close());
  const cosmetics = async (value, user = player) => (await db.query(
    'select public.pin_and_spin_valid_cosmetics($1,$2) as value', [value, user])).rows[0].value;
  const earned = async (user = player) => (await db.query(
    'select public.pin_and_spin_achievements_for($1) as value', [user])).rows[0].value.earned;
  const rewards = Object.entries(GROUPS).flatMap(([group, options]) => options
    .filter(item => /^(duel|rally|relay)_(first|five)$/.test(item.trophy))
    .map(item => ({ group, ...item })));
  assert.equal(rewards.length, 12);
  for (const item of rewards) {
    assert.ok(byCode[item.trophy]?.reward);
    await rejects(cosmetics({ [item.group]: item.id }), /trophy first/);
  }

  await db.query(`insert into public.pin_and_spin_duels(sender,recipient,secret,status,winner)
    values ($1,$2,array[0,1,2,3],'finished',null), ($1,$2,array[0,1,2,3],'playing',null)`, [player,friend]);
  assert.equal((await earned()).duel_first, undefined);
  await db.query(`update public.pin_and_spin_duels set status='finished',winner=$1 where status='playing'`, [player]);
  assert.equal((await db.query(`select count(*)::int n from public.pin_and_spin_achievements
    where user_id=$1 and code='duel_first'`, [player])).rows[0].n, 1);

  const { code } = await game(db).room('relay', 4);
  await db.query(`insert into public.pin_and_spin_results(room_id,puzzle,mode,user_id,won,players)
    select id,1,'relay',$2::uuid,true,4 from public.pin_and_spin_rooms where code=$1
    union all select id,2,'relay',$2::uuid,false,4 from public.pin_and_spin_rooms where code=$1`, [code,player]);
  await db.query(`insert into public.pin_and_spin_solo_games(user_id,kind,status,secret,solved,max_tries)
    values ($1,'rally','won',array[0,1,2,3],4,8), ($1,'rally','lost',array[0,1,2,3],3,8)`, [player]);
  let badges = await earned();
  for (const mode of ['duel','rally','relay']) {
    assert.ok(badges[mode + '_first']);
    assert.equal(badges[mode + '_five'], undefined);
  }
  for (const item of rewards.filter(item => item.trophy.endsWith('_first'))) {
    assert.equal((await cosmetics({ [item.group]: item.id }))[item.group], item.id);
  }

  await db.query(`insert into public.pin_and_spin_duels(sender,recipient,secret,status,winner)
    select $1,$2,array[0,1,2,3],'finished',$1 from generate_series(1,4)`, [player,friend]);
  await db.query(`insert into public.pin_and_spin_results(room_id,puzzle,mode,user_id,won,players)
    select r.id,n,m.mode,$2,true,4 from public.pin_and_spin_rooms r
    cross join (values ('relay'),('rally')) m(mode)
    cross join lateral generate_series(case when m.mode='relay' then 3 else 7 end, case when m.mode='relay' then 6 else 10 end) n
    where r.code=$1`, [code,player]);
  badges = await earned();
  for (const item of rewards) {
    assert.ok(badges[item.trophy]);
    assert.equal((await cosmetics({ [item.group]: item.id }))[item.group], item.id);
    await rejects(cosmetics({ [item.group]: item.id }, null), /trophy first/);
  }
  assert.equal((await earned(friend)).duel_first, undefined);
  await db.exec(await readFile(new URL('../../backend/migrations/026_mode_rewards.sql', import.meta.url), 'utf8'));
  assert.deepEqual(await earned(), badges);
});
