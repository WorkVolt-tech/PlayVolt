import React,{useEffect,useMemo,useState} from 'react';
import {db} from './supabase.js';
import {ChipDisc,AvatarBadge} from './looks.jsx';
import {clampStep,replayFrame,canPlayReplay,outcomeLabel,modeLabels,highlightSteps,replayTimeline,highlightLabel} from './replayModel.js';
import {winningCells,lastMoveCell} from './boardFeedback.js';
import {WinRuleBanner} from './WinRuleBanner.jsx';

const PAGE=20;
function dateLabel(iso) {
 if(!iso)return 'Unknown date';
 const d=new Date(iso);
 return Number.isFinite(d.getTime())?d.toLocaleString():'Unknown date';
}
function ReplayBoard({detail,frame}) {
 const grid={gridTemplateColumns:'repeat('+detail.width+',minmax(0,1fr))'};
 const players=detail.players||[];
 const last=frame.step?detail.moves[frame.step-1]:null;
 const recent=lastMoveCell(frame.board,detail.width,detail.height,last);
 const winners=new Set(frame.step===detail.moves.length?
   winningCells(frame.board,detail.width,detail.height,detail.winnerSeat,detail.mode,last,detail.winLength):[]);
 return <div className="replay-board-wrap">
  <div className="board board-theme-deep-navy replay-board" style={{...grid,minWidth:detail.width>=12?detail.width*34+'px':undefined}} role="grid"
    aria-label={'Recorded board after '+frame.step+' moves'}>
   {(frame.board||[]).map((seat,i)=><div className={'board-cell'+(winners.has(i)?' winning-slot':'')+
       (recent===i?' last-played-slot':'')} key={i} role="gridcell">
     <ChipDisc seat={seat} teamMode={detail.mode==='team'}
      style={players.find(p=>p.seat===seat)?.chipStyle||'round'}/>
   </div>)}
  </div>
 </div>;
}
export function ReplayHub({userId,onBack}) {
 const [offset,setOffset]=useState(0);
 const [listing,setListing]=useState(null);
 const [selected,setSelected]=useState(null);
 const [detail,setDetail]=useState(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [step,setStep]=useState(0);
 const [playing,setPlaying]=useState(false);
 const [highlightMode,setHighlightMode]=useState(false);
 useEffect(()=>{
  if(!userId||selected)return;
  let alive=true;
  setLoading(true);setError('');
  db.rpc('drop_block_match_history',{p_action:'list',p_code:'',p_match:1,p_offset:offset})
   .then(({data,error:e})=>{if(!alive)return;if(e)throw e;setListing(data);})
   .catch(e=>{if(alive){setError(e.message);setListing(null);}})
   .finally(()=>{if(alive)setLoading(false);});
  return ()=>{alive=false;};
 },[userId,offset,selected]);
 useEffect(()=>{
  if(!userId||!selected)return;
  let alive=true;
  setDetail(null);setStep(0);setPlaying(false);setHighlightMode(false);setLoading(true);setError('');
  db.rpc('drop_block_match_history',{p_action:'detail',
    p_code:selected.code,p_match:selected.matchNumber,p_offset:0})
   .then(({data,error:e})=>{if(!alive)return;if(e)throw e;setDetail(data);})
   .catch(e=>{if(alive){setError(e.message);setDetail(null);}})
   .finally(()=>{if(alive)setLoading(false);});
  return ()=>{alive=false;};
 },[userId,selected]);
 const moves=detail?.moves||[];
 const replayable=canPlayReplay(detail);
 const highlights=useMemo(()=>highlightSteps(detail),[detail]);
 const timeline=useMemo(()=>replayTimeline(detail,highlightMode?'highlights':'full'),[detail,highlightMode]);
 const lastPlayable=timeline.length?timeline[timeline.length-1]:0;
 const frame=detail?replayFrame(detail,step):null;
 useEffect(()=>{
  if(!playing||!replayable)return undefined;
  const timer=window.setInterval(()=>setStep(prev=>{
   const following=timeline.find(n=>n>prev);
   return following??prev;
  }),highlightMode?1800:1000);
  return ()=>window.clearInterval(timer);
 },[playing,replayable,timeline,highlightMode]);
 useEffect(()=>{
  if(step>=lastPlayable)setPlaying(false);
 },[step,lastPlayable]);
 function backToList() {setSelected(null);setDetail(null);setPlaying(false);setHighlightMode(false);setStep(0);setError('');}
 const winners=detail?.players?.filter(p=>p.won)||[];
 const winnerText=winners.length?winners.map(p=>p.name).join(', '):'Draw · No winner';
 return <section className="panel replay-hub">
  <div className="replay-header">
   <div><div className="section-eyebrow">PLAYVOLT · DROP &amp; BLOCK</div>
     <h2>{selected?'Match Replay':'Match History'}</h2>
     <p className="sub">Completed online matches only. Replays are read-only and never affect live games.</p>
   </div>
   <div className="replay-header-actions">
     {selected&&<button className="btn secondary" onClick={backToList}>← All matches</button>}
     <button className="btn ghost" onClick={onBack}>← Back to game</button>
   </div>
  </div>
  {error&&<div className="notification" role="alert">{error}</div>}
  {loading&&<div className="replay-loading" role="status">Loading your saved matches…</div>}
  {!selected&&!loading&&!error&&<>
   <div className="replay-list-caption">{listing?.total||0} completed match{listing?.total===1?'':'es'} · Only matches you participated in</div>
   {(listing?.matches||[]).length
    ? <div className="replay-list">{listing.matches.map(m=><button key={m.code+'-'+m.matchNumber}
      type="button" className="replay-match-row"
      onClick={()=>setSelected({code:m.code,matchNumber:m.matchNumber})}>
      <div className="replay-match-icon"><span>↺</span></div>
      <div className="replay-match-main">
       <strong>{modeLabels[m.mode]||m.mode} · Match {m.matchNumber}</strong>
       <small>{dateLabel(m.finishedAt)} · Room {m.code}</small>
       <small>{m.playerCount} players · {m.moveCount} moves</small>
      </div>
      <span className={'replay-outcome '+m.outcome}>{outcomeLabel(m.outcome)}</span>
      <span className="replay-open-icon">View ›</span>
     </button>)}</div>
    : <div className="replay-empty">
       <strong>No completed matches yet</strong>
       <p>Finish an online game with other PlayVolt players, and its result and replay will appear here. Local demos and No Contest matches do not count.</p>
      </div>}
   <div className="replay-pagination">
    <button className="btn ghost" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-PAGE))}>← Previous</button>
    <span>Showing {listing?.total?offset+1:0}–{Math.min(offset+PAGE,listing?.total||0)} of {listing?.total||0}</span>
    <button className="btn ghost" disabled={!listing?.hasMore} onClick={()=>setOffset(offset+PAGE)}>Next →</button>
   </div>
  </>}
  {selected&&!loading&&detail&&<>
   <div className="replay-details">
    <span>{modeLabels[detail.mode]||detail.mode} · Room {detail.code} · Match {detail.matchNumber}</span>
    <strong>{winnerText}</strong>
    <small>{dateLabel(detail.finishedAt)} · {detail.moveCount} accepted moves</small>
   </div>
   <WinRuleBanner mode={detail.mode} winLength={detail.winLength} compact/>
   <div className="replay-player-grid">
    {detail.players.map(p=><div key={p.seat} className={'replay-player'+(p.won?' winning':'')}>
      <AvatarBadge id={p.avatarStyle||'sentinel'} small/>
      <div><strong>{p.name}</strong><small>Player {p.seat} {p.won?'· WINNER':''}</small></div>
      <b>{detail.mode==='territory'?p.score+' pts':p.won?'🏆':''}</b>
    </div>)}
   </div>
   {!replayable
    ? <div className="replay-empty" role="status">
      <strong>Full replay unavailable for this older match</strong>
      <p>The result was saved before board-by-board recording was added. Its winner, players and date remain available, but the moves cannot be accurately reconstructed.</p>
      </div>
    : <>
      <div className="replay-stage">
       <div className="replay-stage-head">
        <strong>{step===0?'Starting board':'Move '+step+' of '+moves.length}</strong>
        <span>{step===0?'Ready to replay':(detail.players.find(p=>p.seat===frame.seat)?.name||'Player '+frame.seat)
        +' · '+(frame.kind==='blast'?'Blast':frame.kind==='block'?'Barrier':'Drop')+' · Column '+(frame.column+1)}</span>
       </div>
       <ReplayBoard detail={detail} frame={frame}/>
       {frame.event&&<div className="replay-event" role="status">{frame.event}</div>}
       <div className="replay-frame-meta">
        <span>Round {frame.round||1}{detail.mode==='collapse'?' · Floor clears '+frame.floorClears:''}</span>
        <span>{step===moves.length?'Final position':step===0?'Before play':'After move '+step}</span>
       </div>
       <div className="replay-frame-stats">
        {frame.players.map(p=><span key={p.seat}>P{p.seat}{detail.mode==='territory'?' · '+p.score+' pts':''}{p.eliminated?' · OUT':''}</span>)}
       </div>
      </div>
      <div className="replay-controls">
       <div className="replay-view-modes" role="group" aria-label="Replay type">
        <button type="button" className={'btn '+(!highlightMode?'primary':'ghost')}
          onClick={()=>{setPlaying(false);setHighlightMode(false);setStep(0);}}>▶ Every Move</button>
        <button type="button" className={'btn '+(highlightMode?'primary':'ghost')}
          onClick={()=>{setPlaying(false);setHighlightMode(true);setStep(0);}}>★ Highlights ({highlights.length})</button>
       </div>
       {highlightMode&&<div className="replay-highlights" aria-label="Important moments">
        {highlights.map(n=><button type="button" key={n} onClick={()=>{setPlaying(false);setStep(n);}}
          className={'replay-highlight-chip'+(step===n?' selected':'')}>
          <b>#{n}</b> {highlightLabel(detail,n)}
        </button>)}
       </div>}
       <div className="replay-controls-buttons">
        <button className="btn ghost" onClick={()=>{setPlaying(false);setStep(0);}} disabled={step===0}>⏮ Start</button>
        <button className="btn ghost" onClick={()=>{setPlaying(false);setStep([...timeline].reverse().find(n=>n<step)??0);}} disabled={step===0}>← Back</button>
        <button className="btn primary" onClick={()=>{if(step>=lastPlayable)setStep(0);setPlaying(v=>!v);}}>{playing?'Ⅱ Pause':highlightMode?'▶ Play Highlights':'▶ Play'}</button>
        <button className="btn ghost" onClick={()=>{setPlaying(false);setStep(timeline.find(n=>n>step)??step);}} disabled={step>=lastPlayable}>Next →</button>
        <button className="btn ghost" onClick={()=>{setPlaying(false);setStep(lastPlayable);}} disabled={step>=lastPlayable}>End ⏭</button>
       </div>
       <label className="replay-slider-label">Move {step} / {moves.length}
         <input type="range" min={0} max={moves.length} step={1} value={step}
           onChange={e=>{setPlaying(false);setStep(clampStep(e.target.value,moves.length));}}
           aria-label="Scrub through recorded moves"/>
       </label>
      </div>
     </>}
  </>}
 </section>;
}
