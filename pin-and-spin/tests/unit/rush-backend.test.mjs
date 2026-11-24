import {test} from 'node:test';
import assert from 'node:assert/strict';
import {freshDb,game} from './db.mjs';
test('Rush seals five guesses, reveals each minute, and finishes at five minutes', async()=>{
 const db=await freshDb();
 try {
 const g=game(db), room=await g.room('rush',2), [a,b]=room.players;
 let s=await g.api('start',room.code,a.token);
 assert.ok(new Date(s.deadline)-new Date(s.serverTime)>299000);
 assert.equal(s.round,0);
 await g.setSecret(room.code,[0,1,2,3]);
 for(let attempt=1;attempt<=5;attempt++) s=await g.api('guess',room.code,a.token,{attempt,puzzle:1,colors:[0,1,2,3]});
 assert.equal(s.status,'playing');
 assert.equal(s.guesses.length,5);
 assert.ok(s.guesses.every(x=>!x.revealed && x.pins===null));
 s=await g.api('guess',room.code,a.token,{attempt:6,puzzle:1,colors:[0,1,2,3]});
 assert.equal(s.guesses.length,5);
 let tv=await g.api('display',room.code,room.display);
 assert.equal(tv.guesses.length,0);
 for(let minute=1;minute<=5;minute++){
   await db.query("update public.pin_and_spin_rooms set deadline=clock_timestamp()+($1::int * interval '1 second') where code=$2",[(5-minute)*60-1,room.code]);
   tv=await g.api('display',room.code,room.display);
   assert.equal(tv.guesses.length,minute);
   assert.ok(tv.guesses.every(x=>x.revealed));
   assert.equal(tv.status,minute===5?'finished':'playing');
 }
 assert.deepEqual(tv.winners,[a.id]);
 s=await g.api('guess',room.code,b.token,{attempt:1,puzzle:1,colors:[0,1,2,3]});
 assert.equal(s.guesses.filter(x=>x.playerId===b.id).length,0);
 await g.api('replay',room.code,a.token);
 await g.api('ready',room.code,b.token,{ready:true});
 s=await g.api('start',room.code,a.token);
 assert.equal(s.round,0);assert.equal(s.guesses.length,0);
 } finally {await db.close();}
});
