import React, {useState} from 'react';
import {MatchRoomBar} from '../screens/MatchHeader.jsx';
import {ShowOnTv} from '../screens/ShowOnTv.jsx';
import {ManagePlayers} from '../screens/ManagePlayers.jsx';
import {GuessPanel} from '../screens/GuessPanel.jsx';
import {RelayBoards, relayTeamName} from './RelayBoards.jsx';
import {RallyProgress, RallyHistory} from './RallyProgress.jsx';
import {canSubmitGuess, myGuesses, nextAttempt, placeColor, remainingTime, formatClock} from '../game/selectors.js';
import {play} from '../sound/sfx.js';

export function RallyMatch({state,onShare,onRemove,onLeave,onCustomize}) {
 const {game,busy,clock,offset,draft,setDraft,selected,setSelected,resetDraft,act,pairTv}=state;
 const [tvOpen,setTvOpen]=useState(false),[managing,setManaging]=useState(false),[view,setView]=useState('play');
 const relay=game.mode==='relay', turn=game.players.find(p=>p.id===game.turnId);
 const host=game.me===game.hostId, finished=game.status==='finished';
 const remaining=remainingTime(game,clock,offset);
 const canSubmit=canSubmitGuess(game,{busy,remainingMs:remaining});
 const appearance=game.players.find(p=>p.id===game.me)?.appearance;
 function color(c){if(!canSubmit)return;const n=placeColor(draft,selected,c);setDraft(n.draft);setSelected(n.selected);play('pop-bubble');}
 return <div className="rally-match">
   <MatchRoomBar game={game} onShare={onShare} onLeave={onLeave} onPlayers={host?()=>setManaging(true):null} onTv={()=>setTvOpen(true)}/>
   {tvOpen&&<ShowOnTv game={game} pairTv={pairTv} onClose={()=>setTvOpen(false)}/>}
   {managing&&<ManagePlayers game={game} busy={busy} onRemove={onRemove} onClose={()=>setManaging(false)}/>}
   <header className="rally-heading"><p className="eyebrow">FOUR CODES. ONE FINISH LINE.</p><h1>⚑ {relay?'RALLY RELAY':'CODE RALLY'}</h1>
     {!finished && <div className="rally-stage-line"><strong>STAGE {game.stage} OF 4</strong><span role="timer">{game.runState==='racing'&&remaining!==null?formatClock(remaining).join(':'):'RUN ENDED'}</span></div>}
   </header>
   {!finished&&<div className="view-tabs" role="tablist" aria-label="Rally views">
     <button className={'view-tab'+(view==='play'?' active':'')} role="tab" aria-selected={view==='play'} onClick={()=>setView('play')}>{relay?'TEAM BOARD':'MY BOARD'}</button>
     <button className={'view-tab'+(view==='race'?' active':'')} role="tab" aria-selected={view==='race'} onClick={()=>setView('race')}>RACE PROGRESS</button>
   </div>}
   {finished||view==='race'?(relay?<RelayBoards game={game} clock={clock} offset={offset}/>:<RallyProgress game={game} clock={clock} offset={offset}/>):<>
     <div className="rally-stage-notice" role="status">{relay?relayTeamName(game.team)+' · '+(game.runState!=='racing'?'Run ended':game.me===game.turnId?'Your turn to submit':(turn?.name || 'Your teammate')+' submits next'):game.runState==='out'?'Your run has ended. Watch the race to see who wins.':`Stage ${game.stage}: solve this ${game.slots}-ball code to advance.`}</div>
     <button className="link-btn" onClick={onCustomize}>✦ Customize my board</button>
     <GuessPanel mine={myGuesses(game)} limit={6} attempt={nextAttempt(game)} canSubmit={canSubmit} draft={draft} selected={selected} onSelect={setSelected} onColor={color} onClear={resetDraft} appearance={appearance}
       onSubmit={()=>{if(canSubmit&&!draft.includes(null)){play('message-sent-swish');void act('guess',{colors:[...draft],puzzle:game.puzzle,stage:game.stage,attempt:nextAttempt(game)});}}}/>
     <p className="rally-private">{relay?'Talk through the clues together. Only the teammate whose turn it is can submit.':'🔒 Your guesses stay private during the race.'}</p>
   </>}
   {finished&&<>{host&&<button className="primary-btn full" disabled={busy} onClick={()=>void act('replay')}>PLAY AGAIN →</button>}{!relay&&<RallyHistory game={game}/>}</>}
 </div>;
}
