import React,{useEffect,useState} from 'react';
import {secondsLeft,clockText} from './turnClockMath.js';

// Server timestamps are authoritative. We compute a relative countdown so
// device clock drift does not let a phone or TV control when a turn expires.
export function TurnClock({game}) {
 const initial=()=>secondsLeft(game.turnDeadline,game.serverNow);
 const [remaining,setRemaining]=useState(initial);
 useEffect(()=>{
  const startSeconds=secondsLeft(game.turnDeadline,game.serverNow);
  setRemaining(startSeconds);
  if(startSeconds===null || game.status!=='playing') return undefined;
  const began=performance.now();
  const tick=()=>{
   const elapsed=(performance.now()-began)/1000;
   setRemaining(Math.max(0,Math.ceil(startSeconds-elapsed)));
  };
  const timer=window.setInterval(tick,250);
  return ()=>window.clearInterval(timer);
 },[game.turnDeadline,game.serverNow,game.status]);
 if(game.status!=='playing'||remaining===null)return null;
 const urgent=remaining<=10;
 const current=game.players.find(p=>p.seat===game.turnSeat);
 return <div className={'turn-clock'+(urgent?' clock-urgent':'')} role="timer" aria-label="Turn time remaining">
  <span><span className="clock-dot"/> {current?.name||'Current player'} · Turn timer</span>
  <strong>{clockText(remaining)}</strong>
  <span className="clock-rules">{game.turnSkips>0?game.turnSkips+' missed turn'+(game.turnSkips===1?'':'s')+' · ':''}Timeout skips the turn</span>
 </div>;
}
