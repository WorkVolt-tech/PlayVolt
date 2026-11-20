import test from 'node:test';
import assert from 'node:assert/strict';
import {ARCADE_SOUND_KEY,soundPlan,soundEnabledAtStart,storeSoundEnabled,playArcadeSound} from '../src/arcadeAudio.js';
test('all sounds are generated from bounded original oscillator cues',()=>{
 for(const name of ['enable','drop','barrier','blast','tick','go','win']){
  const plan=soundPlan(name);
  assert.ok(plan.length>=1&&plan.length<=4);
  for(const tone of plan){
   assert.ok(tone.hz>=35&&tone.hz<=1300);
   assert.ok(tone.end>=35&&tone.end<=1300);
   assert.ok(tone.ms>20&&tone.ms<=500);
   assert.ok(tone.level>0&&tone.level<=.2);
  }
 }
 assert.deepEqual(soundPlan('missing'),[]);
});
test('sound defaults off and stores an explicit per-device choice',()=>{
 const values=new Map(),storage={
  getItem:key=>values.get(key)||null,
  setItem:(key,value)=>values.set(key,value)
 };
 assert.equal(soundEnabledAtStart(storage),false);
 assert.equal(storeSoundEnabled(storage,true),true);
 assert.equal(values.get(ARCADE_SOUND_KEY),'on');
 assert.equal(soundEnabledAtStart(storage),true);
 assert.equal(storeSoundEnabled(storage,false),false);
 assert.equal(soundEnabledAtStart(storage),false);
 assert.equal(soundEnabledAtStart({getItem(){throw Error('private browsing')}}),false);
 assert.doesNotThrow(()=>storeSoundEnabled({setItem(){throw Error('blocked')}},true));
});
test('without browser audio, sound is a harmless no-op',()=>{
 assert.equal(playArcadeSound('drop'),false);
 assert.equal(playArcadeSound('invalid'),false);
});
