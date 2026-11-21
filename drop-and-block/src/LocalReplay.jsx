import React,{useEffect,useMemo,useState} from 'react';
import {ChipDisc,AvatarBadge} from './looks.jsx';
import {localReplayDetail} from './localReplayModel.js';
import {replayFrame,replayTimeline,highlightSteps,clampStep} from './replayModel.js';
import {winningCells,lastMoveCell} from './boardFeedback.js';
import {WinRuleBanner} from './WinRuleBanner.jsx';
export function LocalReplay({state,width,height,mode,count,loadout,onClose}){
 const detail=useMemo(()=>localReplayDetail(state,{width,height,mode,count,loadout}),
  [state,width,height,mode,count,loadout]);
 const [step,setStep]=useState(0);
 const [playing,setPlaying]=useState(false);
 const [highlightsOnly,setHighlightsOnly]=useState(false);
 const timeline=useMemo(()=>replayTimeline(detail,highlightsOnly?'highlights':'full'),
  [detail,highlightsOnly]);
 const highlighted=useMemo(()=>highlightSteps(detail),[detail]);
 const frame=replayFrame(detail,step);
 const last=step>0?detail.moves[step-1]:null;
 const lastCell=lastMoveCell(frame?.board,width,height,last);
 const winning=new Set(step===detail.moves.length&&state.status==='finished'?
   winningCells(frame?.board,width,height,detail.winnerSeat,mode,last,detail.winLength):[]);
 const final=timeline[timeline.length-1]||0;
 useEffect(()=>{
  if(!playing)return;
  const timer=window.setInterval(()=>{
   setStep(n=>{
    const next=timeline.find(x=>x>n);
    if(next===undefined){setPlaying(false);return n;}
    return next;
   });
  },880);
  return ()=>window.clearInterval(timer);
 },[playing,timeline]);
 useEffect(()=>{if(step>detail.moves.length)setStep(detail.moves.length);},[detail.moves.length,step]);
 const goto=n=>{setPlaying(false);setStep(n);};
 return <section className="local-replay panel" aria-label="Local match replay">
  <div className="local-replay-head">
   <div><div className="section-eyebrow">LOCAL MATCH REPLAY</div>
    <h3>↺ Watch every move</h3>
    <small>{detail.moves.length} moves recorded on this device · Not saved online</small>
   </div>
   <button type="button" className="btn ghost" onClick={()=>{setPlaying(false);onClose();}}>Close replay</button>
  </div>
  <WinRuleBanner mode={mode} winLength={detail.winLength} compact/>
  <div className="replay-stage">
   <div className="replay-stage-head">
    <strong>{step===0?'Starting board':'Move '+step+' / '+detail.moves.length}</strong>
    <span>{last?((detail.players.find(p=>p.seat===last.seat)?.name)||'Player '+last.seat)+
      ' · '+(last.kind==='blast'?'Blast':last.kind==='block'?'Barrier':'Drop')+
      ' · Column '+(last.column+1):'Before the first move'}</span>
   </div>
   <div className="replay-board-wrap">
    <div className="board arcade-board replay-board board-theme-deep-navy"
      style={{gridTemplateColumns:'repeat('+width+',minmax(0,1fr))',
       minWidth:width>=12?width*34+'px':undefined}} role="grid"
      aria-label={'Local recorded board after '+step+' moves'}>
     {(frame?.board||[]).map((seat,i)=><div key={i} role="gridcell"
       className={'board-cell'+(winning.has(i)?' winning-slot':'')+(lastCell===i?' last-played-slot':'')}>
       <ChipDisc seat={seat} teamMode={mode==='team'}
        style={detail.players.find(p=>p.seat===seat)?.chipStyle||'round'}/>
     </div>)}
    </div>
   </div>
   {last?.event&&<div className="replay-event" role="status">{last.event}</div>}
   <div className="replay-frame-meta">
    <span>Round {frame?.round||1}</span><span>{step===final?'Latest recorded position':'Reviewing earlier move'}</span>
   </div>
   <div className="replay-frame-stats">{frame?.players?.map(p=><span key={p.seat}>
    P{p.seat}{mode==='territory'?' · '+p.score+' pts':''}{p.eliminated?' · OUT':''}
   </span>)}</div>
  </div>
  <div className="replay-controls">
   <div className="replay-view-modes">
    <button type="button" className={'btn '+(!highlightsOnly?'primary':'ghost')}
      onClick={()=>{setPlaying(false);setStep(0);setHighlightsOnly(false);}}>▶ Every Move</button>
    <button type="button" className={'btn '+(highlightsOnly?'primary':'ghost')}
      onClick={()=>{setPlaying(false);setStep(0);setHighlightsOnly(true);}}>
      ★ Highlights ({highlighted.length})
    </button>
   </div>
   <div className="replay-controls-buttons">
    <button className="btn ghost" disabled={step===0} onClick={()=>goto(0)}>⏮ Start</button>
    <button className="btn ghost" disabled={step===0} onClick={()=>goto([...timeline].reverse().find(x=>x<step)??0)}>← Back</button>
    <button className="btn primary" onClick={()=>{if(step>=final)setStep(0);setPlaying(v=>!v);}}>
     {playing?'Ⅱ Pause':'▶ Play'}
    </button>
    <button className="btn ghost" disabled={step>=final}
      onClick={()=>goto(timeline.find(x=>x>step)??step)}>Next →</button>
    <button className="btn ghost" disabled={step>=final}
      onClick={()=>goto(final)}>End ⏭</button>
   </div>
   <label className="replay-slider-label">Move {step} / {detail.moves.length}
    <input type="range" min="0" max={detail.moves.length} value={step}
      onChange={e=>goto(clampStep(e.target.value,detail.moves.length))}
      aria-label="Scrub local recorded moves"/>
   </label>
  </div>
 </section>;
}
