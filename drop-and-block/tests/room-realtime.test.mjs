import test from 'node:test';
import assert from 'node:assert/strict';
import {roomTopic,watchRoomPulse,reconcileRoom,createRefreshCoordinator} from '../src/roomRealtime.js';

const token='a'.repeat(64);
test('only full-length random-capability topics are subscribed',()=>{
 assert.equal(roomTopic(token),'drop-block-room:'+token);
 assert.equal(roomTopic('abcdef'),null);
 assert.equal(roomTopic(''),null);
 assert.equal(roomTopic(null),null);
 assert.equal(roomTopic('g'.repeat(64)),null);
});
test('room listener only receives refresh invalidations, never writes',()=>{
 const events=[];
 let eventCallback,statusCallback;
 const channel={on(type,filter,fn){events.push(['listen',type,filter.event]);eventCallback=fn;return this;},
  subscribe(fn){statusCallback=fn;events.push(['subscribed']);return this;}};
 const client={channel(topic,config){events.push(['channel',topic,config.config.private]);return channel;},
  removeChannel(value){assert.equal(value,channel);events.push(['removed']);}};
 let count=0,latest;
 const stop=watchRoomPulse(client,token,()=>count++,status=>latest=status);
 statusCallback('SUBSCRIBED');eventCallback();
 assert.equal(latest,'SUBSCRIBED');
 assert.equal(count,1);
 assert.deepEqual(events[0],['channel','drop-block-room:'+token,false]);
 stop();eventCallback();statusCallback('CLOSED');
 assert.equal(count,1);assert.equal(latest,'SUBSCRIBED');
 assert.deepEqual(events.at(-1),['removed']);
});
test('failed websocket subscription leaves the fallback path available',()=>{
 let state;
 const stop=watchRoomPulse({channel(){throw Error('offline');}},token,()=>{},s=>state=s);
 assert.equal(state,'CHANNEL_ERROR');
 assert.doesNotThrow(stop);
});
test('stale polling cannot undo faster moves, rounds, wins, or rematches',()=>{
 const old={code:'ABCDEF',matchNumber:1,moveCount:4,roundNumber:2,status:'playing',serverNow:'2026-11-20T00:00:03Z'};
 const stale={...old,moveCount:3};
 assert.equal(reconcileRoom(old,stale),old);
 assert.equal(reconcileRoom(old,{...old,roundNumber:1}),old);
 assert.equal(reconcileRoom(old,{...old,status:'lobby'}),old);
 assert.equal(reconcileRoom(old,{...old,serverNow:'2026-11-20T00:00:02Z'}),old);
 assert.equal(reconcileRoom(old,{...old,code:'ABC000'}),old);
 const win={...old,status:'finished',moveCount:5};
 assert.equal(reconcileRoom(old,win),win);
 const rematch={...win,matchNumber:2,moveCount:0,roundNumber:1,status:'lobby'};
 assert.equal(reconcileRoom(win,rematch),rematch);
 assert.equal(reconcileRoom(rematch,win),rematch);
});
test('rapid invalidations coalesce; in-flight invalidations trigger a final pass',async()=>{
 const tasks=[];
 const setDelay=fn=>{tasks.push(fn);return tasks.length;};
 const clearDelay=()=>{};
 let resolveFirst;
 const first=new Promise(resolve=>{resolveFirst=resolve;});
 let calls=0;
 const gate=createRefreshCoordinator(()=>{calls++;return calls===1?first:Promise.resolve();},
  {setDelay,clearDelay,delay:30});
 gate.request();gate.request();gate.request();
 assert.equal(tasks.length,1);
 tasks.shift()();await Promise.resolve();await Promise.resolve();
 assert.equal(calls,1);
 gate.request();gate.request();
 resolveFirst();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(tasks.length,1);
 tasks.shift()();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls,2);
 gate.dispose();gate.request();
 assert.equal(tasks.length,0);
});
