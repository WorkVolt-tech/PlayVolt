import React,{useEffect,useRef,useState} from 'react';
import {playArcadeSound,soundEnabledAtStart,storeSoundEnabled} from './arcadeAudio.js';

export function useArcadeSound(){
 const [enabled,setEnabled]=useState(()=>{
  try{return soundEnabledAtStart(typeof window!=='undefined'?window.localStorage:null);}
  catch{return false;}
 });
 const toggle=()=>{
  const next=!enabled;
  try{storeSoundEnabled(typeof window!=='undefined'?window.localStorage:null,next);}
  catch{/* Saving preferences is optional. */}
  setEnabled(next);
  if(next)playArcadeSound('enable');
 };
 return {enabled,toggle};
}
export function SoundToggle({enabled,onToggle}){
 return <button type="button" className={'arcade-sound-toggle'+(enabled?' on':'')}
  aria-label={enabled?'Mute arcade sound effects':'Enable arcade sound effects'}
  aria-pressed={enabled} onClick={onToggle}>
  <span aria-hidden="true">{enabled?'🔊':'🔇'}</span>
  <span>ARCADE SOUND: {enabled?'ON':'OFF'}</span>
 </button>;
}

export function useArcadeLandingSounds(flights,enabled){
 const pending=useRef([]);
 useEffect(()=>{
  pending.current.forEach(clearTimeout);
  pending.current=[];
  if(!enabled||!flights?.length)return undefined;
  pending.current=flights.map(f=>setTimeout(()=>{
   playArcadeSound(f.seat===9?'barrier':'drop');
  },f.delay+Math.floor(f.duration*.68)));
  return ()=>{pending.current.forEach(clearTimeout);pending.current=[];};
 },[flights,enabled]);
 useEffect(()=>()=>pending.current.forEach(clearTimeout),[]);
}

export function useArcadeMatchSounds(game,signal,enabled){
 const last=useRef(null);
 const code=String(game?.code||'local')+':'+String(game?.matchNumber||1);
 const status=game?.status;
 const phase=signal?.phase;
 const count=signal?.count;
 const moveCount=Number(game?.moveCount)||0;
 const lastKind=game?.lastMove?.kind;
 useEffect(()=>{
  const current={code,status,phase,count,moveCount,lastKind};
  const previous=last.current;
  last.current=current;
  if(!enabled||!previous||previous.code!==code)return;
  if(previous.status!=='finished'&&status==='finished') {
   if(game?.winnerSeat)playArcadeSound('win');
   return;
  }
  if(moveCount>previous.moveCount&&lastKind==='blast')playArcadeSound('blast');
  if(game?.mode!=='speed'||status!=='playing')return;
  if(previous.phase==='countdown'&&phase==='go')playArcadeSound('go');
  else if(previous.phase==='countdown'&&phase==='countdown'&&
    count!==previous.count&&count>=1)playArcadeSound('tick');
 },[code,status,phase,count,moveCount,lastKind,enabled,game?.mode,game?.winnerSeat]);
}
