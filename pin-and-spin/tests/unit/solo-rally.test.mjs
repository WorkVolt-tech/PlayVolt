import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {freshDb,rejects} from './db.mjs';
import {MODES} from '../../src/game/constants.js';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
async function setup(t){const db=await freshDb();t.after(()=>db.close());const call=async(a,d={},u=A)=>(await db.query('select public.pin_and_spin_solo($1,$2,$3::jsonb) r',[a,u,JSON.stringify(d)])).rows[0].r;const secret=async g=>(await db.query('select secret from public.pin_and_spin_solo_games where id=$1',[g.id])).rows[0].secret;const guess=(g,colors)=>call('solo_guess',{id:g.id,stage:g.stage,attempt:g.guesses.length+1,colors});return {db,call,secret,guess};}
test('Classic solo: eight guesses, resume, account isolation and repeatable migration',async t=>{
 const {db,call,guess}=await setup(t);await db.exec(await readFile(new URL('../../backend/migrations/023_solo_classic_rally.sql',import.meta.url),'utf8'));
 let g=await call('solo_start',{kind:'classic',level:'hard'});assert.equal(g.maxTries,8);assert.equal(g.colors,6);assert.equal(g.deadline,null);assert.equal(g.answer,null);
 assert.equal((await call('solo_start',{kind:'classic'})).id,g.id);await rejects(call('solo_get',{id:g.id},B),/no longer/);await rejects(call('solo_start',{kind:'classic'},null),/ACCOUNT_REQUIRED/);
 await db.query('update public.pin_and_spin_solo_games set secret=$2 where id=$1',[g.id,[0,1,2,3]]);
 for(let n=1;n<=7;n++){g=await guess(g,[5,5,5,5]);assert.equal(g.status,'playing');}g=await guess(g,[0,1,2,3]);assert.equal(g.status,'won');assert.equal(g.guesses.length,8);
 g=await call('solo_start',{kind:'classic',fresh:true});await db.query('update public.pin_and_spin_solo_games set secret=$2 where id=$1',[g.id,[0,1,2,3]]);for(let n=1;n<=8;n++)g=await guess(g,[5,5,5,5]);assert.equal(g.status,'lost');assert.equal((await guess(g,[0,1,2,3])).guesses.length,8);
});
test('Solo Rally: hidden repetition rules, 4/4/5/6 stages, eight fresh guesses, stale requests and completion',async t=>{
 const {call,secret,guess}=await setup(t);let g=await call('solo_start',{kind:'rally'});assert.equal(new Set(await secret(g)).size,4);
 for(let stage=1;stage<=4;stage++){assert.equal(g.stage,stage);assert.equal(g.maxTries,8);assert.equal(g.slots,[4,4,5,6][stage-1]);assert.equal(g.answer,null);assert.ok(new Date(g.deadline)-new Date(g.serverTime)>175000);if(stage===2)assert.ok(new Set(await secret(g)).size<4);const code=await secret(g),wrong=code.map(c=>(c+1)%6);for(let n=1;n<=7;n++){g=await guess(g,wrong);assert.equal(g.status,'playing');}const old=g;g=await guess(g,code);if(stage<4){assert.equal(g.guesses.length,0);assert.equal((await guess(old,code)).stage,stage+1);assert.equal((await call('solo_start',{kind:'rally'})).id,g.id);}}
 assert.equal(g.status,'won');assert.equal(g.solved,4);assert.equal(g.totalGuesses,32);assert.equal(g.history.length,4);
});
test('Solo Rally: exhaustion and timeout end run, replay resets progress',async t=>{
 const {db,call,secret,guess}=await setup(t);let g=await call('solo_start',{kind:'rally'});g=await guess(g,await secret(g));const wrong=(await secret(g)).map(c=>(c+1)%6);for(let n=0;n<8;n++)g=await guess(g,wrong);assert.equal(g.status,'lost');assert.equal(g.solved,1);g=await call('solo_start',{kind:'rally',fresh:true});assert.equal(g.stage,1);assert.equal(g.solved,0);await db.query("update public.pin_and_spin_solo_games set deadline=now()-interval '1 second' where id=$1",[g.id]);g=await guess(g,await secret(g));assert.equal(g.status,'lost');assert.equal(g.totalGuesses,0);
});
test('Rally is last and edge allows six-ball solo input',async()=>{assert.equal(Object.keys(MODES).at(-1),'rally');assert.match(await readFile(new URL('../../backend/index.ts',import.meta.url),'utf8'),/data.colors.length > 6/);});
