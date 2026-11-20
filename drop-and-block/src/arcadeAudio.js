// Original procedural arcade sound effects; no sampled assets or licensed music.
// AudioContext is created only by a user interaction that enables sound.
// Gameplay stays fully functional if the browser blocks audio.
export const ARCADE_SOUND_KEY='drop_block_arcade_sound_v1';
const presets={
 enable:[{hz:610,end:830,at:0,ms:96,level:.09,wave:'sine'}],
 drop:[{hz:320,end:140,at:0,ms:122,level:.13,wave:'triangle'}],
 barrier:[{hz:240,end:130,at:0,ms:170,level:.12,wave:'square'}],
 blast:[{hz:190,end:65,at:0,ms:235,level:.16,wave:'sawtooth'}],
 tick:[{hz:570,end:460,at:0,ms:96,level:.075,wave:'square'}],
 go:[{hz:470,end:770,at:0,ms:120,level:.12,wave:'sawtooth'},
     {hz:750,end:1050,at:100,ms:190,level:.12,wave:'triangle'}],
 win:[{hz:480,end:540,at:0,ms:135,level:.11,wave:'triangle'},
      {hz:610,end:680,at:115,ms:135,level:.11,wave:'triangle'},
      {hz:760,end:920,at:230,ms:280,level:.12,wave:'triangle'}]
};
let audioContext=null;

export function soundPlan(name){
 return (presets[name]||[]).map(t=>({...t}));
}
export function soundEnabledAtStart(storage){
 try{return storage?.getItem(ARCADE_SOUND_KEY)==='on';}catch{return false;}
}
export function storeSoundEnabled(storage,enabled){
 try{storage?.setItem(ARCADE_SOUND_KEY,enabled?'on':'off');}catch{}
 return Boolean(enabled);
}
export function playArcadeSound(name){
 const tones=presets[name];
 if(!tones)return false;
 try{
  const Ctx=typeof window!=='undefined'?(window.AudioContext||window.webkitAudioContext):null;
  if(!Ctx)return false;
  if(!audioContext)audioContext=new Ctx();
  if(audioContext.state==='suspended')void audioContext.resume().catch(()=>{});
  const now=audioContext.currentTime;
  for(const tone of tones){
   const from=now+tone.at/1000,to=from+tone.ms/1000;
   const osc=audioContext.createOscillator(),gain=audioContext.createGain();
   osc.type=tone.wave;
   osc.frequency.setValueAtTime(tone.hz,from);
   osc.frequency.exponentialRampToValueAtTime(Math.max(35,tone.end),to);
   gain.gain.setValueAtTime(.0001,from);
   gain.gain.exponentialRampToValueAtTime(tone.level,from+.012);
   gain.gain.exponentialRampToValueAtTime(.0001,to);
   osc.connect(gain);gain.connect(audioContext.destination);
   osc.start(from);osc.stop(to+.02);
  }
  return true;
 }catch{return false;}
}
