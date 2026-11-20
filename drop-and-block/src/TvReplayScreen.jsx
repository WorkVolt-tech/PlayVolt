import React,{useEffect,useMemo,useState} from 'react';
import {ChipDisc,AvatarBadge,safeBoard} from './looks.jsx';
import {canPlayReplay,replayFrame,replayTimeline,highlightLabel,modeLabels} from './replayModel.js';

// Entirely read-only playback. The host starts and stops the session from a
// signed-in phone, and Supabase refuses to play over an active match.
export function TvReplayScreen({detail}) {
 const timeline=useMemo(()=>replayTimeline(detail,detail?.mode),[detail]);
 const [cursor,setCursor]=useState(0);
 const highlights=detail?.mode==='highlights';
 useEffect(()=>{setCursor(0);},[detail?.startedAt]);
 useEffect(()=>{
  if(!canPlayReplay(detail)||timeline.length<2)return undefined;
  const timer=window.setInterval(()=>{
    setCursor(old=>{
      if(highlights)return old>=timeline.length+2?0:old+1;
      return Math.min(old+1,timeline.length-1);
    });
  },highlights?2200:1250);
  return ()=>window.clearInterval(timer);
 },[timeline,highlights,detail]);
 if(!canPlayReplay(detail))return <div className="tv-waiting">Recorded replay is not available for this match.</div>;
 const idx=timeline[Math.min(cursor,timeline.length-1)]??0;
 const frame=replayFrame(detail,idx);
 const actor=detail.players.find(p=>p.seat===frame.seat);
 const winners=detail.players.filter(p=>p.won).map(p=>p.name).join(' & ')||'Draw';
 return <div className="tv-replay-screen" aria-label="Read-only TV match replay">
   <div className="tv-replay-banner">
    <span className="tv-replay-kicker">{highlights?'★ PARTY HIGHLIGHTS':'▶ FULL MATCH REPLAY'}</span>
    <strong>{modeLabels[detail.gameMode]||'Drop & Block'} · Match {detail.matchNumber}</strong>
    <span className="tv-replay-winners">{winners}</span>
   </div>
   <div className="tv-replay-caption">
    <strong>{idx===0?'The match begins':highlightLabel(detail,idx)}</strong>
    <span>{idx>0?(actor?.name||'Player '+frame.seat)+' · Column '+(frame.column+1):'Watch the key plays unfold'}</span>
   </div>
   <div className="tv-replay-board-outer">
     <div className={'board tv-replay-board board-theme-'+safeBoard(detail.boardTheme)}
       style={{gridTemplateColumns:'repeat('+detail.width+',minmax(0,1fr))'}} role="grid">
       {frame.board.map((seat,i)=><div className="board-cell" role="gridcell" key={i}>
        <ChipDisc seat={seat} teamMode={detail.gameMode==='team'}
         style={detail.players.find(p=>p.seat===seat)?.chipStyle||'round'}/>
       </div>)}
     </div>
   </div>
   {frame.event&&<div className="tv-replay-event">{frame.event}</div>}
   <div className="tv-replay-bottom">
     <span>MOVE {idx} / {detail.moves.length}{highlights?' · HIGHLIGHT REEL':''}</span>
     <span>ROUND {frame.round||1}{detail.gameMode==='collapse'?' · '+frame.floorClears+' FLOOR CLEARS':''}</span>
   </div>
   <div className="tv-replay-track"><div style={{width:(idx/Math.max(1,detail.moves.length)*100)+'%'}}/></div>
   <div className="tv-replay-players">
    {detail.players.map(p=><div key={p.seat} className={'tv-replay-person'+(p.won?' is-winner':'')}>
      <AvatarBadge id={p.avatarStyle||'sentinel'} small/>
      <span>{p.name}</span>{p.won&&<b>🏆</b>}
     </div>)}
   </div>
   <div className="tv-replay-foot">READ-ONLY · Host controls playback from their phone</div>
 </div>;
}
