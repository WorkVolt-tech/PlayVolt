import React,{useEffect,useState} from 'react';
import {speedStartPhase} from './speedCountdown.js';

export function useSpeedStartSignal(game){
 const [elapsed,setElapsed]=useState(0);
 const active=game?.mode==='speed'&&game?.status==='playing';
 useEffect(()=>{
   setElapsed(0);
   if(!active||!game?.speedRoundOpensAt||!game?.serverNow)return undefined;
   const began=performance.now();
   const tick=()=>setElapsed(performance.now()-began);
   const timer=window.setInterval(tick,90);
   return ()=>window.clearInterval(timer);
 },[active,game?.speedRoundOpensAt,game?.serverNow,game?.roundNumber]);
 return active?speedStartPhase(game.speedRoundOpensAt,game.serverNow,elapsed):
   {phase:'active',count:0};
}
export function SpeedStartSignal({signal,round}){
 if(signal?.phase==='active')return null;
 const waiting=signal.phase==='countdown';
 return <div className={'speed-start-signal '+(waiting?'counting':'go')}
    role="status" aria-label={waiting?'Round '+round+' starts in '+signal.count:'GO. Drop your chip!'}>
   <span>{waiting?'READY · ROUND '+round:'⚡ SPEED ROUND '+round}</span>
   <strong aria-live="off">{waiting?signal.count:'GO!'}</strong>
   <small>{waiting?'Get set. Everyone drops on GO.':'FIRST CHIP WINS THE RACE TO THE BOTTOM'}</small>
 </div>;
}
