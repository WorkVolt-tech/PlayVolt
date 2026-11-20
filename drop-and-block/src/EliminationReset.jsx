import React,{useEffect,useState} from 'react';
import {ChipDisc,AvatarBadge} from './looks.jsx';
import {winningCells} from './boardFeedback.js';
import {eliminationResetState,eliminationGhostOpacity} from './eliminationReset.js';

// A deterministic server-clock-relative reset animation, shared by phones/TV.
export function useEliminationReset(game){
 const [elapsed,setElapsed]=useState(0);
 useEffect(()=>{
  setElapsed(0);
  if(game?.mode!=='elimination'||game?.status!=='playing'||
   !game.eliminationRoundOpensAt||!game.serverNow)return undefined;
  const began=performance.now();
  const timer=window.setInterval(()=>setElapsed(performance.now()-began),75);
  return ()=>window.clearInterval(timer);
 },[game?.mode,game?.status,game?.matchNumber,game?.roundNumber,
    game?.eliminationRoundOpensAt,game?.serverNow]);
 return eliminationResetState(game,elapsed);
}
export function EliminationBoardReset({game,reset,players=[],width,height,winLength=4}){
 if(!reset.active)return null;
 const saved=game.eliminationPreviousBoard;
 const valid=Array.isArray(saved)&&saved.length===width*height;
 const player=players.find(p=>p.seat===reset.targetSeat);
 const scorer=players.find(p=>p.seat===reset.scorerSeat);
 const last=game.lastMove;
 const glowing=new Set(valid&&reset.scorerSeat?
   winningCells(saved,width,height,reset.scorerSeat,'elimination',last,winLength):[]);
 const alpha=eliminationGhostOpacity(reset.progress);
 return <>
  {valid&&alpha>0&&<div className="elimination-ghost-board" aria-hidden="true"
     style={{gridTemplateColumns:'repeat('+width+',minmax(0,1fr))',
       opacity:alpha,transform:'scale('+(1-Math.max(0,reset.progress-.3)*.08)+')'}}>
    {saved.map((seat,i)=><div key={i} className={'board-cell'+(glowing.has(i)?' winning-slot':'')}>
      <ChipDisc seat={seat}
       style={players.find(p=>p.seat===seat)?.chipStyle||'round'}/>
     </div>)}
  </div>}
  <div className={'elimination-reset-overlay phase-'+reset.phase} role="status"
   aria-label={'Arena resetting. Next round in '+reset.seconds}>
   <div className="elimination-reset-energy" aria-hidden="true"/>
   <small>{reset.targetSeat?'ELIMINATION CONFIRMED':'ROUND COMPLETE'}</small>
   <div className="elimination-reset-avatar" aria-hidden="true">
    {player?<AvatarBadge id={player.avatarStyle||'sentinel'}/>:<span>↻</span>}
   </div>
   <strong>{reset.targetSeat?(player?.name||'Player '+reset.targetSeat)+' ELIMINATED!':'BOARD FULL · NO ELIMINATIONS'}</strong>
   <p>{reset.targetSeat?
    (scorer?.name||'Player '+reset.scorerSeat)+' connected '+winLength+
    '. The previous active player failed to block.':
    'No connection was completed. All survivors continue.'}</p>
   <div className="elimination-reset-progress">
    <span>{reset.phase==='eliminated'?'CONNECTION MADE':
      reset.phase==='clearing'?'RESETTING ARENA':'NEXT ROUND IN'}</span>
    <b>{reset.seconds}</b>
   </div>
  </div>
 </>;
}
