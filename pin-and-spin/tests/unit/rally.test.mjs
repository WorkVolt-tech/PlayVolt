import {test} from 'node:test';
import assert from 'node:assert/strict';
import {freshDb,game,rejects,tok} from './db.mjs';
import {canSubmitGuess,guessLimit,nextAttempt} from '../../src/game/selectors.js';
const codes=[[0,1,2,3],[0,0,1,2],[0,1,2,3,4],[0,0,1,2,3,4]];
async function setup(count=2){
 const db=await freshDb(),g=game(db),r=await g.room('rally',count),a=r.players[0];
 let s=await g.api('start',r.code,a.token);
 for(let i=1;i<=4;i++) await db.query('update public.pin_and_spin_rally_codes set secret=$1 where room_id=(select id from public.pin_and_spin_rooms where code=$2) and stage=$3',[codes[i-1],r.code,i]);
 const guess=(p,stage,attempt,colors=codes[stage-1],puzzle=1)=>g.api('guess',r.code,p.token,{stage,attempt,colors,puzzle});
 return {db,g,r,a,s,guess};
}
test('Rally code generator obeys hidden stage rules and private six-color codes for ten players',async()=>{
 const db=await freshDb();try{
 const g=game(db),r=await g.room('rally',10);const s=await g.api('start',r.code,r.players[0].token,{maxColors:8,maxSlots:6});
 const {rows}=await db.query('select stage,secret from public.pin_and_spin_rally_codes order by stage');
 assert.deepEqual(rows.map(r=>r.secret.length),[4,4,5,6]);
 assert.equal(new Set(rows[0].secret).size,4);assert.ok(new Set(rows[1].secret).size<4);
 assert.ok(rows.every(r=>r.secret.every(c=>c>=0&&c<6)));
 assert.equal(s.colors,6);assert.equal(s.slots,4);assert.equal(s.answer,null);assert.equal(s.players.length,10);
 assert.ok(Date.parse(s.deadline)-Date.parse(s.serverTime)>179000);
 assert.equal(s.rallyHistory.length,0);
 }finally{await db.close();}
});
test('Rally advances independently, rejects duplicate/stale guesses, and hides codes from other players and TV',async()=>{
 const {db,g,r,a,guess}=await setup();try{
 let s=await guess(a,1,1,[0,1,2,4]);assert.equal(s.guesses[0].pins,3);
 let b=await g.api('state',r.code,r.players[1].token);assert.equal(b.guesses.length,0);assert.equal(b.rallyHistory.length,0);
 let tv=await g.api('display',r.code,r.display);assert.equal(tv.guesses.length,0);assert.equal(tv.rallyHistory.length,0);
 s=await guess(a,1,2);assert.equal(s.stage,2);assert.equal(s.guesses.length,0);assert.equal(s.players[0].rally.completed,1);
 s=await guess(a,1,2);assert.equal(s.stage,2);assert.equal(s.players[0].rally.totalGuesses,2);
 b=await g.api('state',r.code,r.players[1].token);assert.equal(b.stage,1);
 await rejects(g.api('display',r.code,tok(999)),/Invalid display/);
 await rejects(g.api('guess',r.code,r.display,{stage:1,attempt:1,puzzle:1,colors:codes[0]}),/seat/);
 s=await guess(a,2,1);assert.equal(s.slots,5);
 await rejects(guess(a,3,1,[0,1,2,3]),/Fill every slot/);
 s=await guess(a,3,1);assert.equal(s.slots,6);assert.equal(s.stage,4);
 s=await guess(a,4,1);assert.equal(s.status,'finished');assert.deepEqual(s.winners,[a.id]);assert.equal(s.rallyHistory.length,5);
 tv=await g.api('display',r.code,r.display);assert.equal(tv.rallyHistory.length,5);
 await g.api('replay',r.code,a.token);await g.api('ready',r.code,r.players[1].token,{ready:true});
 s=await g.api('start',r.code,a.token);assert.equal(s.puzzle,2);assert.equal(s.stage,1);assert.equal(s.guesses.length,0);assert.equal(s.rallyHistory.length,0);
 s=await guess(a,1,1,codes[0],1);assert.equal(s.guesses.length,0);
 }finally{await db.close();}
});
test('six guesses are allowed, a sixth-guess solve advances, exhaustion ends only that run',async()=>{
 const {db,g,r,a,guess}=await setup();try{
 for(let n=1;n<=5;n++)await guess(a,1,n,[5,5,5,5]);
 let s=await guess(a,1,6);assert.equal(s.stage,2);assert.equal(s.runState,'racing');
 for(let n=1;n<=6;n++)s=await guess(a,2,n,[5,5,5,5]);
 assert.equal(s.runState,'out');assert.equal(s.status,'playing');
 s=await guess(a,2,7);assert.equal(s.guesses.length,6);
 for(let n=1;n<=6;n++)s=await guess(r.players[1],1,n,[5,5,5,5]);
 assert.equal(s.status,'finished');assert.deepEqual(s.winners,[a.id]);
 }finally{await db.close();}
});
test('deadline expires on server before input, reconnect keeps stage, no solve means no winner',async()=>{
 const {db,g,r,a,guess}=await setup();try{
 await db.query("update public.pin_and_spin_rally_runs set deadline=clock_timestamp()-interval '1 second' where player_id=$1",[a.id]);
 let s=await guess(a,1,1);assert.equal(s.runState,'out');assert.equal(s.guesses.length,0);assert.equal(s.status,'playing');
 s=await g.api('state',r.code,a.token);assert.equal(s.runState,'out');
 await db.query("update public.pin_and_spin_rally_runs set deadline=clock_timestamp()-interval '1 second'");
 s=await g.api('display',r.code,r.display);assert.equal(s.status,'finished');assert.deepEqual(s.winners,[]);
 }finally{await db.close();}
});
test('failed races rank by completed codes, fewer guesses, then progress time',async()=>{
 const {db,g,r,a,guess}=await setup(3);try{
 for(const p of r.players)await guess(p,1,1);
 await db.query("update public.pin_and_spin_rally_runs set deadline=clock_timestamp()-interval '1 second',progress_at=started_at+interval '10 seconds'");
 await db.query("update public.pin_and_spin_rally_runs set total_guesses=2 where player_id=$1",[a.id]);
 await db.query("update public.pin_and_spin_rally_runs set progress_at=started_at+interval '5 seconds' where player_id=$1",[r.players[2].id]);
 const s=await g.api('state',r.code,a.token);assert.deepEqual(s.winners,[r.players[2].id]);
 }finally{await db.close();}
});
test('Rally server tables and helpers are not exposed to clients',async()=>{
 const db=await freshDb();try{
 const {rows}=await db.query("select relrowsecurity from pg_class where relname in ('pin_and_spin_rally_codes','pin_and_spin_rally_runs','pin_and_spin_rally_guesses')");
 assert.equal(rows.length,3);assert.ok(rows.every(x=>x.relrowsecurity));
 const {rows:[r]}=await db.query("select has_table_privilege('anon','public.pin_and_spin_rally_codes','select') a, has_function_privilege('authenticated','public.pin_and_spin_rally_view(uuid,uuid,jsonb)','execute') b");
 assert.equal(r.a,false);assert.equal(r.b,false);
 }finally{await db.close();}
});
test('Rally controller has six attempts and cannot submit after its run ends',()=>{
 const g={mode:'rally',status:'playing',runState:'racing',me:'a',guesses:[]};
 assert.equal(guessLimit('rally'),6);assert.equal(nextAttempt(g),1);
 assert.equal(canSubmitGuess(g,{busy:false,remainingMs:100}),true);
 assert.equal(canSubmitGuess({...g,runState:'out'},{busy:false,remainingMs:100}),false);
});
test('Rally records shared-account results, excludes guests, and preserves a departed participant',async()=>{
 const {db,g,r,a,guess}=await setup(3);try{
 const users=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
 for(let i=0;i<2;i++){
   await db.query('insert into profiles(id,nickname) values($1,$2)',[users[i],'Account'+i]);
   await db.query('update public.pin_and_spin_players set user_id=$1 where id=$2',[users[i],r.players[i].id]);
 }
 const call=(p,action,data={})=>g.api(action,r.code,p.token,{...data,_account_id:users[r.players.indexOf(p)]});
 await call(r.players[1],'guess',{puzzle:1,stage:1,attempt:1,colors:[5,5,5,5]});
 await call(r.players[1],'leave');
 for(let stage=1;stage<=4;stage++)await call(a,'guess',{puzzle:1,stage,attempt:1,colors:codes[stage-1]});
 const {rows}=await db.query('select user_id,won from public.pin_and_spin_results order by user_id');
 assert.equal(rows.length,2);assert.equal(rows[0].won,true);assert.equal(rows[1].won,false);
 }finally{await db.close();}
});
