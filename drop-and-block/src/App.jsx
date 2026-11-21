import React, { useEffect, useState } from 'react';
import { db, action } from './supabase.js';
import { emptyBoard, dimensions, playLocalTurn, playChaosTurn, playTeamTurn, teamOfSeat, balancedWinLength } from './rules.js';
import { VersionAlert } from './VersionAlert.jsx';
import { ProgressHub, TrophyUnlockNotice } from './ProgressHub.jsx';
import { buildTvDisplayUrl } from './tvLink.js';
import {AvatarBadge,ChipDisc,safeBoard} from './looks.jsx';
import {CustomizeHub} from './CustomizeHub.jsx';
import {TurnClock} from './TurnClock.jsx';
import {ReplayHub} from './ReplayHub.jsx';
import {TvReplayControls} from './TvReplayControls.jsx';
import {canCloseLobby,canEndStalled,canRematch,isNoContest,isClosedLobby} from './hostControls.js';
import {canPlayColumn,wideBoardMinWidth} from './boardInteraction.js';
import {lastMoveCell,winningCells} from './boardFeedback.js';
import {MatchSpotlight} from './MatchSpotlight.jsx';
import {speedRoundState} from './speedRound.js';
import {SpeedStartSignal,useSpeedStartSignal} from './SpeedStartSignal.jsx';
import {watchRoomPulse,reconcileRoom,createRefreshCoordinator} from './roomRealtime.js';
import {useArcadeFallingChips,ArcadeFallingChips} from './ArcadeFallingChips.jsx';
import {useEliminationReset,EliminationBoardReset} from './EliminationReset.jsx';
import {useArcadeSound,SoundToggle,useArcadeLandingSounds,useArcadeMatchSounds} from './ArcadeSounds.jsx';
import {LocalReplay} from './LocalReplay.jsx';
import {appendLocalMove} from './localReplayModel.js';
import {WinRuleBanner} from './WinRuleBanner.jsx';
import {TvPairHost} from './TvPairHost.jsx';
import {initPowerState,playPowerTurn,powerTargetAllowed,activateDouble} from './powerRules.js';
import {playGravityTurn,emptyRivalry,registerRivalry,SHIFT_EVERY} from './arcadeModes.js';
import {MatchScoreboard} from './MatchScoreboard.jsx';

const icons = ['','◆','●','▲','■','★','⬡','✦','✳','⬢'];
const colors = ['','Coral','Cyan','Gold','Mint','Violet','Orange','Pink','Silver'];
const hub = 'https://playvolt-hub.pages.dev/';

function Board({ board, width, height, turn, me, onDrop, disabled, readOnly = false, moveKind = 'drop', teamMode = false, players=[], boardTheme='deep-navy', lastMove=null, winnerSeat=null, status='playing', mode='classic', matchNumber=1,moveCount=0,floorClears=0,speedOrder=[],speedPreviousOrder=[],soundEnabled=false,winLength=4,eliminationGame=null,eliminationReset=null,power=null,selectedPower='drop' }) {
  const columns = Array.from({length: width}, (_,i) => i);
  const rows = Array.from({length: height}, (_,i) => i);
  const grid = { gridTemplateColumns: 'repeat(' + width + ', minmax(0, 1fr))' };
  // Keep column targets usable on narrow phones; the board scrolls inside its own viewport.
  const minWidth=readOnly?0:Math.max(wideBoardMinWidth(width,readOnly),width*42);
  const available=col=>power?(!disabled&&turn===me&&powerTargetAllowed({board,turn,...power},selectedPower,col,width,height)):canPlayColumn(board,width,height,col,moveKind,disabled||turn!==me);
  const actionLabel=power?(selectedPower==='freeze'?'Freeze':selectedPower==='bomb'?'Bomb':selectedPower==='shield'?'Shield':selectedPower==='double'?'Double-drop chip':'Drop chip'):moveKind==='blast'?'Blast':'Place '+(moveKind==='block'?'barrier':'chip');
  const lastCell=lastMoveCell(board,width,height,lastMove);
  const winning=new Set(status==='finished'?winningCells(board,width,height,winnerSeat,mode,lastMove,winLength):[]);
  const effectColumn=lastMove?.column!==undefined&&(lastMove.kind==='blast'||lastMove.kind==='bomb'||lastCell===null)
    ?lastMove.column:null;
  const {flights,hidden}=useArcadeFallingChips({
    board,width,height,matchNumber,moveCount,floorClears,lastMove,mode,
    speedOrder,speedPreviousOrder
  });
  useArcadeLandingSounds(flights,soundEnabled);
  return <div className="board-wrap">
    <div className={'board-scroll'+(minWidth?' is-wide':'')}
      role={minWidth?'region':undefined} aria-label={minWidth?'Game board. On small phones, swipe horizontally to reach additional columns.':undefined}
      tabIndex={minWidth?0:undefined}>
      <div className="board-inner" style={minWidth?{minWidth:minWidth+'px'}:undefined}>
        {!readOnly&&<div className="board-controls" style={grid}>
          {columns.map(col=><button type="button" key={col} className={'drop-arrow'+(lastMove?.column===col?' recently-used':'')+(power?.frozen?.column===col?' frozen-drop-arrow':'')}
            aria-label={actionLabel+' in column '+(col+1)}
            disabled={!available(col)} onClick={()=>onDrop(col)}>
            {power?.frozen?.column===col?'❄':power&&selectedPower==='freeze'?'❄':power&&selectedPower==='shield'?'⬡':power&&selectedPower==='bomb'?'✹':power&&selectedPower==='double'?'⇊':moveKind==='blast'?'✹':moveKind==='block'?'⬢':'▼'}
          </button>)}
        </div>}
        <div className="board-tap-area">
          <div className={'board arcade-board board-theme-'+safeBoard(boardTheme)+(mode==='gravity'&&lastMove?.shifted?' gravity-shift-impact':'')} style={grid} role="grid" aria-label="Drop & Block game board">
            {rows.flatMap(row=>columns.map(col=>{
              const seat=board[row*width+col]||0;
              const index=row*width+col;
              const isWinner=winning.has(index),isRecent=lastCell===index;
              return <div className={'board-cell'+(isWinner?' winning-slot':'')+
                (isRecent?' last-played-slot':'')+(power?.shields?.includes(index)?' power-shielded':'')+(power?.frozen?.column===col?' power-frozen':'')+(power?.frozen?.column===col&&seat?' power-frozen-chip':'')+(effectColumn===col?' move-effect-column':'')+
                (hidden.has(index)?' arcade-under-flight':'')}
                role="gridcell" key={row+'-'+col}
                title={isWinner?'Winning connection':isRecent?'Most recent chip':undefined}>
                <ChipDisc seat={seat} style={players.find(p=>p.seat===seat)?.chipStyle||'round'} teamMode={teamMode}/>{power?.frozen?.column===col&&seat>0&&<span className="freeze-flake" aria-label="Column frozen">❄</span>}{power?.shields?.includes(index)&&<span className="shield-symbol" aria-label="Shield protected">⬡</span>}
              </div>;
            }))}
          </div>
          <ArcadeFallingChips flights={flights} width={width} height={height}
             players={players} teamMode={teamMode}/>
          {eliminationReset?.active&&<EliminationBoardReset
             game={eliminationGame} reset={eliminationReset}
             width={width} height={height} players={players} winLength={winLength}/>}

          {!readOnly&&<div className="board-tap-columns" style={grid} role="group" aria-label="Tap a board column to place a piece">
            {columns.map(col=><button type="button" key={col} className="board-tap-column"
              aria-label={actionLabel+' in column '+(col+1)} disabled={!available(col)}
              onClick={()=>onDrop(col)}/>)}
          </div>}
        </div>
      </div>
    </div>
    {!readOnly&&<p className="board-mobile-hint">
      Tap a column to play{width>=9?' · Swipe the board sideways for more columns':''}
    </p>}
  </div>;
}

function LocalDemo({ onBack, count, mode, loadout }) {
  const [width, height] = dimensions(count);
  const reset = () => ({ board:emptyBoard(width,height), turn:1, scores:Array(count).fill(0), status:'playing', winner:null, winnerTeam:null, eliminated:Array(count).fill(false), roundNumber:1, floorClears:0, lastEvent:'', lastMove:null, moveCount:0, matchNumber:1, chaosBlockUsed:Array(count).fill(false), chaosBlastUsed:Array(count).fill(false), eliminationRoundOpensAt:null,eliminationPreviousBoard:null,eliminationTargetSeat:null,eliminationScorerSeat:null,history:[],power:initPowerState(count),gravity:{drops:0,nextDirection:'left',lastShift:null},rivalry:emptyRivalry(count) });
  const [state, setState] = useState(reset);
  const [activeLocalTab,setActiveLocalTab]=useState('game');
  const [powerChoice,setPowerChoice]=useState('drop');
  const freshSession=()=>({wins:Array(count).fill(0),lastWinner:null,callout:''});
  const [session,setSession]=useState(freshSession);
  useEffect(()=>{
    if(state.status!=='finished'||!Number.isInteger(state.winner))return;
    setSession(previous=>{
      const wins=[...previous.wins];wins[state.winner-1]++;
      const callout=previous.lastWinner&&previous.lastWinner!==state.winner
        ?'🔥 REVENGE! Player '+state.winner+' dethroned the previous winner, Player '+previous.lastWinner+'!':'';
      return {wins,lastWinner:state.winner,callout};
    });
  },[state.status,state.winner]);
  const players = Array.from({length:count},(_,i)=>({seat:i+1,name:'Player '+(i+1),score:state.scores[i],eliminated:state.eliminated[i],chaosBlockUsed:state.chaosBlockUsed[i],chaosBlastUsed:state.chaosBlastUsed[i],avatarStyle:i===0?loadout?.avatar:'sentinel',chipStyle:i===0?loadout?.chip:'round'}));
  function play(col,kind='drop') {
    if(mode==='power')kind=powerChoice;
    setState(old=>{
      if(mode==='power'){
        const next=playPowerTurn(old,col,count,width,height,old.power.doublePending?'double':kind);
        return registerRivalry(old,next,count,width,height,mode);
      }
      if(mode==='gravity'){
        const next=playGravityTurn(old,col,count,width,height);
        if(next===old)return old;
        const tracked=registerRivalry(old,next,count,width,height,mode);
        return {...tracked,history:appendLocalMove(old.history||[],old,tracked,{seat:old.turn,column:col,row:next.lastMove.row,kind:'drop',width,height})};
      }
      if(mode==='elimination'&&old.eliminationRoundOpensAt&&
         Date.now()<Date.parse(old.eliminationRoundOpensAt))return old;
      const next=mode==='team'?playTeamTurn(old,col,count,width,height):
        mode==='chaos'?playChaosTurn(old,col,count,width,height,kind):
        playLocalTurn(old,col,count,mode,width,height);
      if(next===old)return old;
      let row=height-1;
      if(kind!=='blast'){
        for(let y=height-1;y>=0;y--){
          if(old.board[y*width+col]===0){row=y;break;}
        }
      }
      const tracked=registerRivalry(old,next,count,width,height,mode);
      return {...tracked,moveCount:(old.moveCount||0)+1,
        lastMove:{seat:old.turn,column:col,row,kind,
          earned:(next.scores?.[old.turn-1]||0)-(old.scores?.[old.turn-1]||0)},
        history:appendLocalMove(old.history||[],old,tracked,{
          seat:old.turn,column:col,row,kind,width,height
        })};
    });
    setPowerChoice('drop');
    return true;
  }
  const useDouble=()=>{setState(old=>activateDouble(old,count));setPowerChoice('drop');};
  return <div className="panel panel-wide">
    <div className="section-eyebrow">LOCAL PREVIEW · SAME DEVICE</div>
    <h2>{modeName(mode)} · {count} Players</h2>
    <p className="sub">Pass the device around. This demo is offline; your actual online rooms use PlayVolt accounts.</p>
    <div className="local-game-tabs" role="tablist" aria-label="Local match views">
      <button id="local-game-tab" type="button" role="tab"
        aria-selected={activeLocalTab==='game'} aria-controls="local-game-panel"
        className={activeLocalTab==='game'?'selected':''}
        onClick={()=>setActiveLocalTab('game')}>🎮 Game</button>
      <button id="local-replay-tab" type="button" role="tab"
        aria-selected={activeLocalTab==='replay'} aria-controls="local-replay-panel"
        className={activeLocalTab==='replay'?'selected':''}
        onClick={()=>setActiveLocalTab('replay')}>↺ Replay <span className="local-tab-count">{state.history?.length||0}</span></button>
    </div>
    <div id="local-game-panel" role="tabpanel" aria-labelledby="local-game-tab" hidden={activeLocalTab!=='game'}>
      <GameArea game={{...state,width,height,mode,players,sessionWins:session.wins,sessionCallout:session.callout,turnSeat:state.turn,meSeat:state.turn,winnerSeat:state.winner,winLength:balancedWinLength(count,mode)}} boardTheme={loadout?.board}
        onDrop={play} busy={false} powerChoice={powerChoice} onPowerChoice={setPowerChoice} onDouble={useDouble}/>
      <div className="actions local-demo-actions">
        <button className="btn ghost" onClick={onBack}>← Back</button>
        <button className="btn primary" onClick={()=>{setState(reset);setActiveLocalTab('game');setPowerChoice('drop');}}>Next match · keep scores</button>
        <button className="btn ghost" onClick={()=>{setSession(freshSession());setState(reset);setActiveLocalTab('game');setPowerChoice('drop');}}>Reset session</button>
      </div>
      <p className="local-tv-explainer">📺 TV / Fire Stick display is available for <b>online rooms</b>.
       This offline same-device preview cannot sync to a separate television.
       Create an online room to pair a Fire Stick and let everyone play from their phones.</p>
    </div>
    <div id="local-replay-panel" role="tabpanel" aria-labelledby="local-replay-tab" hidden={activeLocalTab!=='replay'}>
      {activeLocalTab==='replay'&&(state.history?.length>0
        ? <LocalReplay state={state} width={width} height={height}
            count={count} mode={mode} loadout={loadout} onClose={()=>setActiveLocalTab('game')}/>
        : <div className="local-replay-empty"><strong>No moves to replay yet</strong><p>Play a few chips, then return to this tab to review the match.</p>
           <button type="button" className="btn secondary" onClick={()=>setActiveLocalTab('game')}>← Back to game</button></div>)}
    </div>
  </div>;
}

const modeName = mode => ({ speed: 'Speed Round', classic: 'Classic', territory: 'Territory', elimination: 'Elimination', collapse: 'Bottom Drop', chaos: 'Chaos', power:'Power-Up Arcade', gravity:'Gravity Shift', team: 'Team Battle' })[mode] || 'Classic';

export function GameArea({game, onDrop, busy, readOnly = false, boardTheme, powerChoice='drop', onPowerChoice, onDouble}) {
  const [moveKind,setMoveKind]=useState('drop');
  const current=game.players.find(p=>p.seat===game.meSeat);
  const selectColumn=async col=>{
    const kind=game.mode==='chaos'?moveKind:game.mode==='power'?powerChoice:'drop';
    const ok=await onDrop(col,kind);
    if(ok!==false)setMoveKind('drop');
  };
  const turnPlayer = game.players.find(p=>p.seat===game.turnSeat);
  const winner = game.players.find(p=>p.seat===game.winnerSeat);
  const lastPlayer=game.players.find(p=>p.seat===game.lastMove?.seat);
  const lastMoveLabel=game.lastMove?.kind==='blast'?'used Blast on':
    game.lastMove?.kind==='block'?'placed a Barrier in':
    game.lastMove?.kind==='freeze'?'froze':game.lastMove?.kind==='shield'?'shielded a chip in':
    game.lastMove?.kind==='bomb'?'bombed':game.lastMove?.kind==='double'?'double-dropped in':'played';
  const isSpeed=game.mode==='speed';
  const winLength=game.winLength===3?3:4;
  const speedState=speedRoundState(game,game.meSeat);
  const speedSignal=useSpeedStartSignal(game);
  const eliminationReset=useEliminationReset(game);
  const arcadeSound=useArcadeSound();
  useArcadeMatchSounds(game,speedSignal,arcadeSound.enabled);
  const submitted=speedState.submitted;
  const iSubmitted=isSpeed&&speedState.alreadyPlayed;
  const showActiveTurn=game.status==='playing'&&!isSpeed&&!eliminationReset.active&&Number.isInteger(game.turnSeat);
  const myTurn=!readOnly&&game.status==='playing'&&!eliminationReset.active&&
    (isSpeed?speedState.canSubmit&&speedSignal.phase!=='countdown':game.turnSeat===game.meSeat);
  return <>
    <WinRuleBanner mode={game.mode} winLength={winLength} playerCount={game.players.length}
      lobby={game.status==='lobby'}/>
    <div className="arcade-sound-tray">
      <span aria-hidden="true">✦</span>
      <span className="arcade-sound-label">ARCADE EFFECTS</span>
      <SoundToggle enabled={arcadeSound.enabled} onToggle={arcadeSound.toggle}/>
    </div>
    <div className="roster">{game.players.map(p=><div key={p.seat} className={'player-chip seat-border-' + p.seat + (showActiveTurn&&game.turnSeat===p.seat?' current turn-active':'')+(isSpeed&&submitted.has(p.seat)?' speed-submitted':'') + (p.eliminated?' eliminated':'')+(game.mode==='team'?' team-roster-'+teamOfSeat(p.seat):'')}>
      <AvatarBadge id={p.avatarStyle||'sentinel'} small/><span className={'tiny-disc seat-'+p.seat}>{icons[p.seat]}</span>
      <span className="player-label">{p.name}{p.eliminated?' · OUT':game.mode==='team'?' · '+(teamOfSeat(p.seat)===1?'Gold':'Blue'):game.mode==='territory'?' · '+p.score+' pts':''}
       {isSpeed&&game.status==='playing'&&<small className={'speed-roster-status'+(submitted.has(p.seat)?' placed':' waiting')}>
          {submitted.has(p.seat)?'#'+(speedState.positionBySeat.get(p.seat)||'')+' · Dropped':'⚡ Ready to drop'}
        </small>}
       {p.online!==undefined&&<small className={'player-presence '+(p.online?'online':'away')}>{p.online?'● Online':'○ Away'}{p.timedOutTurns>0?' · '+p.timedOutTurns+' missed':''}</small>}
      </span>
      {showActiveTurn&&game.turnSeat===p.seat&&<span className="playing-now-label">▶ PLAYING NOW</span>}
    </div>)}</div>
    {isSpeed&&game.status==='playing'&&<div className="speed-round-panel" role="status">
      <div className="speed-round-header">
        <strong>⚡ SPEED ROUND {game.roundNumber||1}</strong>
        <span>{submitted.size} / {game.players.length} PLAYED</span>
      </div>
      <div className="speed-round-players">
        {game.players.map(p=><span key={p.seat} className={'speed-player'+(submitted.has(p.seat)?' done':'')}>
          {submitted.has(p.seat)?'#'+(speedState.positionBySeat.get(p.seat)||'?'):'⚡'} {p.name}
        </span>)}
      </div>
      {game.speedPreviousRound&&speedState.previousOrder.length>0&&
        <div className="speed-previous-standings">
          <strong>PREVIOUS ROUND {game.speedPreviousRound} · FINISH ORDER</strong>
          <div>{speedState.previousOrder.map(row=><span key={row.seat}>
            <b>#{row.place}</b> {game.players.find(p=>p.seat===row.seat)?.name||'Player '+row.seat}
          </span>)}</div>
        </div>}
      <p>Everyone races on GO. The first server-accepted chip goes in first. One drop each, then the next round begins.</p>
    </div>}
    {game.mode==='team' && <div className="team-scoreline">
      <div className="team-side team-gold"><strong>TEAM GOLD</strong><small>{game.players.filter(p=>teamOfSeat(p.seat)===1).map(p=>p.name).join(' · ')}</small></div>
      <b>VS</b>
      <div className="team-side team-blue"><strong>TEAM BLUE</strong><small>{game.players.filter(p=>teamOfSeat(p.seat)===2).map(p=>p.name).join(' · ')}</small></div>
    </div>}
    {game.mode==='chaos' && <div className="mode-status">CHAOS MODE · ONE BARRIER AND ONE BLAST PER PLAYER PER MATCH</div>}
    {game.mode==='elimination' && <div className="mode-status">ROUND {game.roundNumber || 1} · {game.players.filter(p=>!p.eliminated).length} SURVIVORS</div>}
    {game.mode==='collapse' && <div className="mode-status">BOTTOM ROW DROPS: {game.floorClears || 0} · TRIGGER AT SECOND ROW FROM TOP</div>}
    {game.lastEvent&&!eliminationReset.active&&
      !(game.mode==='elimination'&&game.eliminationRoundOpensAt)&&
      <div className="round-event" role="status">{game.lastEvent}</div>}
    {isSpeed&&<SpeedStartSignal signal={speedSignal} round={game.roundNumber||1}/>}
    {!eliminationReset.active&&(!isSpeed||speedSignal.phase!=='countdown')&&<TurnClock game={game}/>} 

    {game.lastMove&&<div className="last-move-caption">
      <span className="last-move-tag">LAST MOVE</span>
      <span>{lastPlayer?.name||'Player '+game.lastMove.seat} {lastMoveLabel} column {game.lastMove.column+1}
        {game.lastMove.earned>0?' · '+game.lastMove.earned+' line'+(game.lastMove.earned===1?'':'s')+' connected':''}</span>
    </div>}
    <div className={'turn-notice' + (myTurn?' is-me':'')+(showActiveTurn?' turn-notice-active turn-seat-'+game.turnSeat:'')}>
      {game.status==='cancelled' ? (isNoContest(game) ? 'No Contest · Match ended without a winner' : 'Room closed by the host')
        : game.status==='finished' ? (game.mode==='team' ? (game.winnerTeam || winner ? 'Team '+((game.winnerTeam || teamOfSeat(winner?.seat))===1?'Gold':'Blue')+' wins!' : 'Match finished · Draw') : (winner ? winner.name+' wins!' : 'Match finished · Draw'))
        : eliminationReset.active?'ARENA RESET · NEXT ROUND IN '+eliminationReset.seconds+'…'
        : isSpeed
          ? speedSignal.phase==='countdown'?'GET READY · DROP ONLY WHEN YOU SEE GO!'
            : readOnly?'ALL PLAYERS CAN DROP NOW · FIRST CHIP GOES FIRST'
            : iSubmitted?'✓ CHIP LOCKED IN · WAITING FOR EVERYONE ELSE'
            : '⚡ DROP NOW · FIRST ACCEPTED CHIP LANDS FIRST!'
          : showActiveTurn ? <span className="turn-announcement"><span className="turn-announcement-kicker">▶ NOW PLAYING</span><strong>{turnPlayer?.name||'Player '+game.turnSeat}</strong><span className="turn-announcement-instruction">{game.power?.doublePending?'Double Drop — chip '+(3-game.power.doublePending)+' of 2':myTurn?'Choose a column or power-up':'Waiting for their move'}</span></span> : 'Waiting for the next turn…'}
    </div>
    <MatchSpotlight game={game}/>
    <MatchScoreboard game={game}/>
    {game.rivalry?.lastCallout&&<div className="rivalry-callout" role="status">{game.rivalry.lastCallout}</div>}
    {game.sessionCallout&&game.status==='finished'&&<div className="rivalry-callout" role="status">{game.sessionCallout}</div>}
    {game.mode==='gravity'&&<div className="gravity-status" role="status"><strong>🌪 GRAVITY SHIFT{game.lastMove?.shifted?' · SHIFTED '+game.lastMove.shiftDirection.toUpperCase()+'!':''}</strong><span>Every {SHIFT_EVERY} chips, the board shifts {game.gravity?.nextDirection?.toUpperCase()||'LEFT'}. Next shift in {SHIFT_EVERY-((game.gravity?.drops||0)%SHIFT_EVERY)} {SHIFT_EVERY-((game.gravity?.drops||0)%SHIFT_EVERY)===1?'drop':'drops'}.</span><small>Connections are checked both before and after shifting. Multiple simultaneous connections result in a draw.</small></div>}
    {game.mode==='power'&&game.power&&<div className="power-roster">{game.players.map(p=><div key={p.seat} className={'power-player'+(showActiveTurn&&game.turnSeat===p.seat?' active':'')}><b>{p.name}{showActiveTurn&&game.turnSeat===p.seat&&<small className="power-playing-label"> · PLAYING</small>}</b><span>{game.power.energy[p.seat-1]}/100 EP</span><div className="power-track"><i style={{width:(game.power.energy[p.seat-1]||0)+'%'}}/></div></div>)}</div>}
    {game.mode==='power'&&game.power&&<section className="power-help" aria-label="How Power-Up Mode works">
      <div className="power-help-head"><strong>⚡ HOW TO USE POWER-UPS</strong><span>Each ability costs energy (EP) · Each activation uses your turn except Double Drop</span></div>
      <p className="power-help-flow"><b>1.</b> Drop chips to earn EP <b>2.</b> Select an unlocked power <b>3.</b> Tap its target column on the board</p>
      <div className="power-help-grid">
        <div><strong>⇊ Double · 100 EP</strong><span>Tap Double, then drop <b>two chips</b> one at a time in any available columns. Both happen on your turn.</span></div>
        <div><strong>❄ Freeze · 80 EP</strong><span>Tap Freeze, then choose a column. <b>No one can drop there</b> until your next turn. Existing chips stay in place and appear icy.</span></div>
        <div><strong>⬡ Shield · 70 EP</strong><span>Tap Shield, then tap a column where <b>your chip is on top</b>. Protects it from one Bomb hit.</span></div>
        <div><strong>✹ Bomb · 100 EP</strong><span>Tap Bomb, then choose an occupied or frozen column. Hits its <b>topmost chip and neighboring chips</b> on that row. <b>Shatters ice</b> in the blast area and unlocks the frozen column.</span></div>
      </div>
    </section>}
    {game.mode==='power'&&game.power?.frozen&&<div className="frozen-alert" role="status">❄ COLUMN {game.power.frozen.column+1} IS FROZEN — locked until Player {game.power.frozen.owner}'s next turn. Chips in the column are not destroyed.</div>}
    {game.mode==='power'&&!readOnly&&onPowerChoice&&<div className="power-actions" role="group" aria-label="Power-up abilities">{[['drop','▼ Normal chip',0],['shield','⬡ Shield',70],['freeze','❄ Freeze',80],['bomb','✹ Bomb',100]].map(([kind,title,cost])=><button type="button" key={kind} aria-pressed={powerChoice===kind} className={'power-action'+(powerChoice===kind?' selected':'')} disabled={busy||game.status!=='playing'||cost>(game.power?.energy?.[game.turnSeat-1]||0)||game.power?.doublePending} onClick={()=>onPowerChoice(kind)}>{title}{cost?' · '+cost+' EP':''}</button>)}<button type="button" className={'power-action'+(game.power?.doublePending?' selected':'')} disabled={busy||game.status!=='playing'||game.power?.doublePending||(game.power?.energy?.[game.turnSeat-1]||0)<100} onClick={onDouble}>⇊ Double · 100 EP</button></div>}
    {game.mode==='power'&&!readOnly&&<div className={'power-instruction'+(game.power?.doublePending?' double-active':'')} role="status">{game.power?.doublePending?'⇊ DOUBLE DROP ACTIVE: place chip '+(3-game.power.doublePending)+' of 2. Tap a column. Your turn continues until both chips are placed.':powerChoice==='shield'?'⬡ SHIELD SELECTED: tap a column whose top chip belongs to you. It will survive one Bomb hit.':powerChoice==='bomb'?'✹ BOMB SELECTED: tap an occupied or frozen column. The blast removes unshielded chips in its row and SHATTERS any frozen column it touches.':powerChoice==='freeze'?'❄ FREEZE SELECTED: tap an available column to lock it for every player until your next turn.':'▼ NORMAL DROP: tap an available column. Placing chips earns EP. Select a power above to use it.'}</div>}
    {game.mode==='chaos' && !readOnly && <div className="chaos-powers" role="group" aria-label="Choose a Chaos move">
      <button type="button" className={'chaos-power'+(moveKind==='drop'?' selected':'')} onClick={()=>setMoveKind('drop')} disabled={busy}>▼ Normal Drop</button>
      <button type="button" className={'chaos-power'+(moveKind==='block'?' selected':'')} onClick={()=>setMoveKind('block')} disabled={busy||!current||current.chaosBlockUsed||game.status!=='playing'}>⬢ Barrier {current?.chaosBlockUsed?'USED':'1×'}</button>
      <button type="button" className={'chaos-power'+(moveKind==='blast'?' selected':'')} onClick={()=>setMoveKind('blast')} disabled={busy||!current||current.chaosBlastUsed||game.status!=='playing'}>✹ Blast {current?.chaosBlastUsed?'USED':'1×'}</button>
    </div>}
    {game.mode==='chaos' && <p className="chaos-tip">{readOnly?'Players use their limited Chaos powers from their phones.':moveKind==='blast'?'Blast removes the bottom chip of a column, dropping the chips above it. Select a column with chips.':moveKind==='block'?'Barrier places a neutral chip into a column to block connections.':'Normal Drop connects '+winLength+' to win. Choosing a power uses your turn.'}</p>}
    <Board board={game.board} width={game.width} height={game.height}
      turn={isSpeed?game.meSeat:game.turnSeat} me={game.meSeat} onDrop={selectColumn}
      disabled={busy || game.status!=='playing'||iSubmitted||eliminationReset.active||(isSpeed&&speedSignal.phase==='countdown')} readOnly={readOnly} moveKind={moveKind} power={game.mode==='power'?game.power:null} selectedPower={game.power?.doublePending?'double':powerChoice} teamMode={game.mode==='team'} players={game.players} boardTheme={boardTheme||game.hostBoardTheme}
      lastMove={game.lastMove} winnerSeat={game.winnerSeat} status={game.status} mode={game.mode}
      matchNumber={game.matchNumber||1} moveCount={game.moveCount||0} floorClears={game.floorClears||0}
      speedOrder={game.speedOrder||[]} speedPreviousOrder={game.speedPreviousOrder||[]}
      soundEnabled={arcadeSound.enabled} winLength={winLength}
      eliminationReset={eliminationReset} eliminationGame={game}/>
    <div className="board-foot">{isSpeed?'ONE CHIP EACH PER ROUND · FASTEST ACCEPTED DROP GOES FIRST · CONNECT '+winLength+' TO WIN':game.mode==='territory'?'CONNECT '+winLength+' TO SCORE':game.mode==='elimination'?'CONNECT '+winLength+' · PREVIOUS ACTIVE PLAYER IS ELIMINATED':game.mode==='collapse'?'CONNECT '+winLength+' TO WIN · THE BOTTOM ROW DROPS WHEN THE STACK GETS HIGH':game.mode==='chaos'?'DROP, BLOCK OR BLAST · CONNECT '+winLength+' TO WIN':game.mode==='power'?'POWER-UP ARCADE · CONNECT '+winLength+' TO WIN':game.mode==='team'?'CONNECT 4 TEAM CHIPS TO WIN · TEAMMATES SHARE THE VICTORY':'CONNECT '+winLength+' TO WIN'} · {game.width} × {game.height}</div>
  </>;
}

export default function App() {
  const [user,setUser] = useState(undefined);
  const [profile,setProfile] = useState(null);
  const [authTab,setAuthTab] = useState('sign-in');
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [nickname,setNickname] = useState('');
  const [maxPlayers,setMaxPlayers] = useState(4);
  const [mode,setMode] = useState('classic');
  const [joinCode,setJoinCode] = useState(() => new URLSearchParams(location.search).get('room')?.toUpperCase() || '');
  const [room,setRoom] = useState(null);
  const [demo,setDemo] = useState(false);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [showProgress,setShowProgress] = useState(false);
  const [showCustomize,setShowCustomize] = useState(false);
  const [showHistory,setShowHistory] = useState(false);
  const [menuOpen,setMenuOpen] = useState(false);
  const [syncStatus,setSyncStatus] = useState('connected');
  const [roomTransport,setRoomTransport] = useState('connecting');
  const [myLoadout,setMyLoadout] = useState(null);
  const [freshTrophies,setFreshTrophies] = useState([]);
  const [progressRefresh,setProgressRefresh] = useState(0);

  useEffect(() => {
    let alive = true;
    db.auth.getSession().then(({data}) => {if(alive)setUser(data.session?.user??null);})
      .catch(()=>{if(alive)setUser(null);});
    const {data:{subscription}} = db.auth.onAuthStateChange((_event,session)=>{
      if(alive)setUser(session?.user??null);
    });
    return ()=>{alive=false;subscription.unsubscribe();};
  },[]);
  useEffect(()=>{
    if(!user?.id) { setProfile(null); return; }
    let active=true;
    db.from('profiles').select('nickname').eq('id',user.id).maybeSingle()
      .then(({data})=>{if(active)setProfile(data);}).catch(()=>{if(active)setProfile(null);});
    return ()=>{active=false;};
  },[user?.id]);
  useEffect(()=>{
    if(!user?.id){setMyLoadout(null);return;}
    let alive=true;
    db.rpc('drop_block_customization',{p_action:'get',p_category:'',p_item:''})
     .then(({data,error})=>{if(alive&&!error)setMyLoadout(data.equipped);})
     .catch(()=>{});
    return ()=>{alive=false;};
  },[user?.id]);
  // A refresh or new deployment restores online rooms from the URL without starting a new game.
  useEffect(() => {
    if (!user?.id) return;
    const code = new URLSearchParams(window.location.search).get('room')?.toUpperCase();
    if (!code || !/^[A-F0-9]{6}$/.test(code)) return;
    let active = true;
    action('join', code).then(next => { if(active){setRoom(next);setJoinCode(next.code);} })
      .catch(err => { if(active)setMessage('Could not reconnect to room: ' + err.message); });
    return () => { active = false; };
  }, [user?.id]);
  // Remember previously earned trophies when signing in, to avoid announcing
  // historical trophies as if they were new on a fresh device.
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    db.rpc('drop_block_progress', { p_mode:'all', p_period:'all', p_limit:25 })
      .then(({data,error}) => {
        if (!active || error || !data) return;
        const key = 'drop_block_trophies_seen_' + user.id;
        try {
          if (localStorage.getItem(key) === null) {
            localStorage.setItem(key, JSON.stringify(data.earned.map(t => t.code)));
          }
        } catch { /* storage is optional */ }
      });
    return () => {active=false;};
  }, [user?.id]);

  // Trophy unlocks are awarded on the server when the match finishes. Fetch
  // only once per finished match; 2-second room polling won't repeat notices.
  useEffect(() => {
    if (!user?.id || room?.status !== 'finished') return;
    let active=true;
    const key='drop_block_trophies_seen_' + user.id;
    db.rpc('drop_block_progress', {p_mode:'all',p_period:'all',p_limit:25})
      .then(({data,error}) => {
        if (!active || error || !data) return;
        const earned=data.earned.map(t => t.code);
        let seen=[];
        try {
          const saved=localStorage.getItem(key);
          if (saved) seen=JSON.parse(saved);
          localStorage.setItem(key, JSON.stringify(earned));
        } catch { /* optional local notification state */ }
        if (!Array.isArray(seen)) seen=[];
        const newest=earned.filter(code => !seen.includes(code));
        if (newest.length) setFreshTrophies(newest);
        setProgressRefresh(n=>n+1);
      });
    return () => {active=false;};
  }, [user?.id,room?.code,room?.matchNumber,room?.status]);

  // Broadcast only tells the phone "refresh": room state is always read
  // through the existing authenticated server RPC. A slow interval remains
  // in case the WebSocket is unavailable or the browser was suspended.
  useEffect(()=>{
    if(!user?.id || !room?.code || !room?.displayToken)return undefined;
    let alive=true,live=false,lastAttempt=0;
    const code=room.code;
    const refresh=async()=>{
      lastAttempt=Date.now();
      try{
        const next=await action('get',code);
        if(alive){
          setRoom(current=>reconcileRoom(current,next));
          setSyncStatus('connected');
        }
      }catch{
        if(alive)setSyncStatus('reconnecting');
      }
    };
    const gate=createRefreshCoordinator(refresh,{delay:110});
    const stop=watchRoomPulse(db,room.displayToken,gate.request,status=>{
      if(!alive)return;
      live=status==='SUBSCRIBED';
      setRoomTransport(live?'live':'fallback');
      if(live)gate.request();
    });
    const timer=window.setInterval(()=>{
      if(document.hidden)return;
      const fallbackMs=live?15000:room.mode==='speed'?3500:6000;
      if(Date.now()-lastAttempt>=fallbackMs)gate.request();
    },1000);
    const resume=()=>{if(!document.hidden)gate.request();};
    const onOnline=()=>gate.request();
    document.addEventListener('visibilitychange',resume);
    window.addEventListener('online',onOnline);
    gate.request();
    return ()=>{
      alive=false;stop();gate.dispose();window.clearInterval(timer);
      document.removeEventListener('visibilitychange',resume);
      window.removeEventListener('online',onOnline);
    };
  },[user?.id,room?.code,room?.displayToken,room?.mode]);

  // Without rapid polling, a present player still has to resolve an expired
  // server deadline. The GET RPC is allowed to advance exactly one turn/round.
  useEffect(()=>{
    if(!user?.id||room?.status!=='playing'||!room?.code||
       !room?.turnDeadline||!room?.serverNow)return undefined;
    const ms=Date.parse(room.turnDeadline)-Date.parse(room.serverNow);
    if(!Number.isFinite(ms))return undefined;
    let active=true;
    const timer=window.setTimeout(()=>{
      action('get',room.code).then(next=>{
        if(active){
          setRoom(current=>reconcileRoom(current,next));
          setSyncStatus('connected');
        }
      }).catch(()=>{if(active)setSyncStatus('reconnecting');});
    },Math.max(250,Math.min(75000,ms+240)));
    return ()=>{active=false;window.clearTimeout(timer);};
  },[user?.id,room?.code,room?.status,room?.turnDeadline,room?.matchNumber]);

  useEffect(()=>{
    if(!menuOpen)return undefined;
    const onKeyDown=e=>{if(e.key==='Escape')setMenuOpen(false);};
    const onOutside=e=>{if(!e.target.closest?.('.mobile-nav'))setMenuOpen(false);};
    document.addEventListener('keydown',onKeyDown);
    document.addEventListener('pointerdown',onOutside);
    return ()=>{document.removeEventListener('keydown',onKeyDown);document.removeEventListener('pointerdown',onOutside);};
  },[menuOpen]);

  async function auth(e) {
    e.preventDefault();
    setBusy(true);setMessage('');
    try {
      if(authTab==='sign-in') {
        const {error}=await db.auth.signInWithPassword({email,password});
        if(error)throw error;
      } else {
        const {data,error}=await db.auth.signUp({email,password,options:{data:{nickname:nickname.trim()}}});
        if(error)throw error;
        setMessage(data.session?'Account created. Welcome!':'Check your email to confirm your existing PlayVolt account sign-up.');
      }
      setPassword('');
    } catch(err){setMessage(err.message);} finally{setBusy(false);}
  }
  async function perform(type, data={}, code=room?.code||'') {
    setBusy(true);setMessage('');
    try {
      const next=await action(type,code,data);
      setRoom(current=>current?.code===next.code?reconcileRoom(current,next):next);
      setJoinCode(next.code);setSyncStatus('connected');
      history.replaceState(null,'',location.pathname+'?room='+next.code);
      return true;
    } catch(err) {setMessage(err.message);return false;} finally{setBusy(false);}
  }
  function exitRoom() {
    setRoom(null);setMessage('');setSyncStatus('connected');setRoomTransport('connecting');setMenuOpen(false);
    history.replaceState(null,'',location.pathname);
  }
  function openSection(section) {
    setShowProgress(section==='progress');
    setShowCustomize(section==='customize');
    setShowHistory(section==='history');
    setMenuOpen(false);
    if(section!=='game')setDemo(false);
  }
  async function copyRoomCode(){
    if(!room?.code)return;
    try{
      await navigator.clipboard.writeText(room.code);
      setMessage('Room code '+room.code+' copied. Share it with your friends.');
    }catch{
      window.prompt('Copy your Drop & Block room code:',room.code);
    }
  }
  function tvUrl() {
    if (!room?.displayToken) return null;
    return buildTvDisplayUrl(window.location, room.code, room.displayToken);
  }
  async function copyTvUrl() {
    const url = tvUrl();
    if (!url) { setMessage('TV display is not available for this room yet.'); return; }
    try {
      await navigator.clipboard.writeText(url);
      setMessage('TV link copied. Open it on a TV, computer or tablet.');
    } catch {
      window.prompt('Copy the TV link to open on your TV:', url);
    }
  }
  function openTv() {
    const url = tvUrl();
    if (!url) { setMessage('TV display is not available for this room yet.'); return; }
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  async function shareRoom() {
    if(!room)return;
    const link=location.origin+location.pathname+'?room='+room.code;
    try{if(navigator.share){await navigator.share({title:'Drop & Block',text:'Join my room: '+room.code,url:link});}
      else {await navigator.clipboard.writeText(link);setMessage('Room link copied!');}}
    catch(err){if(err.name!=='AbortError')setMessage('Room code: '+room.code);}
  }
  async function signOut() {
    await db.auth.signOut();setUser(null);setRoom(null);setMessage('');setRoomTransport('connecting');setShowProgress(false);setShowCustomize(false);setShowHistory(false);setMenuOpen(false);setMyLoadout(null);setFreshTrophies([]);
    history.replaceState(null,'',location.pathname);
  }
  return <div className="shell">
    <header className="topbar"><a href={hub} className="back">← PLAYVOLT</a>
      <span className="mini-brand">DROP <b>&</b> BLOCK</span>
      <span className="header-right">{user && <>
        <nav className="desktop-game-nav" aria-label="PlayVolt game navigation">
          {!demo&&<button className="text-btn custom-nav" onClick={()=>openSection(showCustomize?'game':'customize')}>{showCustomize?'← Game':'🎨 Customize'}</button>}
          {!demo&&<button className="text-btn history-nav" onClick={()=>openSection(showHistory?'game':'history')}>{showHistory?'← Game':'↺ Match History'}</button>}
          {!demo&&<button className="text-btn trophies-nav" onClick={()=>openSection(showProgress?'game':'progress')}>{showProgress?'← Game':'🏆 Trophies & Ranks'}</button>}
          <button className="text-btn" onClick={signOut}>Sign out</button>
        </nav>
        <div className="mobile-nav">
          <button type="button" className="mobile-menu-toggle" aria-expanded={menuOpen}
            aria-controls="drop-block-mobile-menu" onClick={()=>setMenuOpen(v=>!v)}>
            <span>Menu</span><span aria-hidden="true">{menuOpen?'✕':'☰'}</span>
          </button>
          {menuOpen&&<nav id="drop-block-mobile-menu" className="mobile-menu-panel" aria-label="Mobile game navigation">
            <button type="button" onClick={()=>{setDemo(false);openSection('game');}}>🎮 Back to game</button>
            <button type="button" onClick={()=>openSection('customize')}>🎨 Customize</button>
            <button type="button" onClick={()=>openSection('history')}>↺ Match History</button>
            <button type="button" onClick={()=>openSection('progress')}>🏆 Trophies & Ranks</button>
            <button type="button" className="mobile-signout" onClick={signOut}>Sign out</button>
          </nav>}
        </div>
      </>}</span>
    </header>
    <main className="content">
      {!room && !demo && !showProgress && !showCustomize && !showHistory && <div className="hero">
        <div className="logo-art" aria-hidden="true"><div className="dot-1">◆</div><div className="dot-2">●</div><div className="dot-3">▲</div><div className="dot-4">■</div></div>
        <div className="section-eyebrow">THE MULTIPLAYER STRATEGY SHOWDOWN</div>
        <h1>DROP <span>&</span> BLOCK</h1>
        <p>Drop smart. Block hard.</p>
      </div>}
      {message && <div className="notification" role="status">{message}</div>}
      {showHistory ? <ReplayHub userId={user?.id} onBack={()=>setShowHistory(false)}/> :
       showCustomize ? <CustomizeHub userId={user?.id} onBack={()=>setShowCustomize(false)} onEquipped={setMyLoadout}/> :
       showProgress ? <ProgressHub userId={user?.id} refreshSignal={progressRefresh}
          onBack={()=>setShowProgress(false)} onHistory={()=>{setShowHistory(true);setShowProgress(false);}}/> :
       demo ? <LocalDemo key={maxPlayers+'-'+mode} onBack={()=>setDemo(false)} count={maxPlayers} mode={mode} loadout={myLoadout}/> :
      room ? <section className="panel panel-wide">
        <div className="room-top"><div><div className="section-eyebrow">PRIVATE ROOM</div>
        <h2>{room.code}</h2><p className="sub">{modeName(room.mode)} · Match {room.matchNumber || 1} · {room.players.length}/{room.maxPlayers} players</p>
        <p className="lobby-win-target">{room.status==='lobby'?'Start with '+room.players.length+' player'+(room.players.length===1?'':'s')+': Connect '+balancedWinLength(room.players.length,room.mode):
         'Match rule · Connect '+(room.winLength===3?3:4)+(room.mode==='team'?' team chips':' chips')}</p></div>
        <div className="room-share-actions">
          <button type="button" className="btn ghost" onClick={copyRoomCode}>Copy code</button>
          <button type="button" className="btn secondary" onClick={shareRoom}>Invite friends</button>
        </div></div>
        {room.status==='lobby'&&<WinRuleBanner mode={room.mode} playerCount={room.players.length} lobby/>}
        <div className={'room-sync '+(syncStatus==='connected'?'is-connected':'is-reconnecting')} role="status">
          <span aria-hidden="true">{syncStatus==='connected'?'●':'◌'}</span>
          {syncStatus==='connected'?(roomTransport==='live'?'Room connected · Instant updates':'Room connected · Automatic refresh'):'Connection interrupted · Trying to reconnect'}
          {syncStatus!=='connected'&&<button type="button" onClick={async()=>{
             try{const next=await action('get',room.code);setRoom(current=>reconcileRoom(current,next));setSyncStatus('connected');}
             catch{setMessage('Still offline. Check your connection and try again.');}
          }}>Retry now</button>}
        </div>
        <div className="tv-launch">
          <span><b>TV Party Mode</b><small>Live read-only display on a TV or Fire Stick · Everyone plays on their phone.</small></span>
          <div className="tv-launch-actions">
            <button type="button" className="btn secondary" onClick={openTv} disabled={!room.displayToken}>Open TV</button>
            <button type="button" className="btn ghost" onClick={copyTvUrl} disabled={!room.displayToken}>Copy TV link</button>
          </div>
        </div>
        <TvPairHost room={room}/>
        {room.host&&['finished','lobby'].includes(room.status)&&
          <TvReplayControls room={room} onRefresh={()=>perform('get')}/>} 
        {room.status==='lobby' ? <>
          <div className="roster">{room.players.map(p=><div key={p.seat} className={'player-chip seat-border-'+p.seat}>
            <AvatarBadge id={p.avatarStyle||'sentinel'} small/><span className={'tiny-disc seat-'+p.seat}>{icons[p.seat]}</span>
            <span>{p.name} {room.mode==='team'?'· Team '+(teamOfSeat(p.seat)===1?'Gold':'Blue'):''} {p.ready?'✓ Ready':'· Not ready'}
              {p.online!==undefined&&<small className={'player-presence '+(p.online?'online':'away')}> · {p.online?'Online':'Away'}</small>}
            </span></div>)}</div>
          <p className="online-timer-note">{room.mode==='speed'
            ? 'Speed Round: All players drop simultaneously, one chip each per 60-second round. The server orders the chips by submission. A new round opens when everyone has played; missing players are skipped at the deadline.'
            : 'Online games: 60 seconds per turn. An expired turn is skipped automatically when a player is connected. Rejoin using the same room code after a disconnect.'}</p>
          {room.mode==='team' && <div className="team-lobby-note">Players alternate into Gold and Blue teams by join order. Wait for 4, 6, or 8 players so both teams have the same size.</div>}
          <p className="sub lobby-note">{room.matchNumber > 1
            ? 'Rematch ready! Everyone keeps their seat, and the starting player rotates. Confirm you are ready, then the host can start.'
            : 'Invite friends using the room code. Each person joins on their own phone with the same PlayVolt login they already use.'}</p>
          {room.host
            ? <button className="btn primary full" disabled={busy||room.players.length<2||(room.mode==='team'&&![4,6,8].includes(room.players.length))||room.players.some(p=>!p.ready)}
                onClick={()=>perform('start')}>Start match</button>
            : <button className="btn primary full" disabled={busy} onClick={()=>perform('ready',{ready:!room.players.find(p=>p.seat===room.meSeat)?.ready})}>
                {room.players.find(p=>p.seat===room.meSeat)?.ready?'Cancel ready':'I’m ready!'}</button>}
          {canCloseLobby(room)&&<div className="host-room-control">
            <div><strong>Host controls · Close this lobby</strong>
              <span>Unused room? Close it so nobody else can join. No game results are recorded.</span></div>
            <button type="button" className="btn ghost host-danger-btn" disabled={busy}
             onClick={()=>{if(window.confirm('Close this room? Players will no longer be able to join using this code. No wins or trophies will be awarded.'))void perform('cancel');}}>
             Close lobby</button>
          </div>}
        </> : isClosedLobby(room)
          ? <div className="closed-room-state" role="status">
              <strong>Room closed by the host</strong>
              <p>This room code is no longer accepting players. No results or trophies were recorded.</p>
              <button type="button" className="btn secondary" onClick={exitRoom}>Return to menu</button>
            </div>
          : <GameArea game={room} onDrop={(col,kind)=>perform('drop',{column:col,kind})} busy={busy} boardTheme={myLoadout?.board}/>}
        {room.host&&room.status==='playing'&&<div className="host-room-control">
          <div><strong>Host controls · Abandoned match</strong>
            <span>To prevent unfair cancellations, No Contest becomes available after 3 minutes without a move, plus another player away for 90 seconds or two missed turns.</span>
            <small>{room.canNoContest ? 'This match qualifies for No Contest. No result will be recorded.' : 'Match is still active or does not meet the abandonment rules.'}</small></div>
          <button type="button" className="btn ghost host-danger-btn" disabled={busy||!canEndStalled(room)}
            onClick={()=>{if(window.confirm('End this stalled match as No Contest? No winner, leaderboard points, or trophies will be awarded. You can start a rematch in the same room.'))void perform('cancel');}}>
            End match · No Contest</button>
        </div>}
        {(room.status==='finished'||isNoContest(room)) && <div className="rematch-panel">
          <div className="rematch-copy">
            <strong>{isNoContest(room)?'No Contest · Match '+(room.matchNumber||1):'Match '+(room.matchNumber||1)+' complete'}</strong>
            <span>{isNoContest(room)
              ? 'The game ended without a winner or results. All players keep their seats for another match.'
              : 'Keep this room and all the same players. Results and match history are saved.'}</span></div>
          {canRematch(room)
            ? <button className="btn primary" disabled={busy} onClick={()=>perform('rematch')}>
                Play again · Same players
              </button>
            : <span className="rematch-waiting">Waiting for the host to start the next match…</span>}
        </div>}
        <div className="actions">
          <button className="btn secondary" onClick={()=>{setShowCustomize(true);setShowProgress(false);setShowHistory(false);}}>🎨 Customize</button>
          <button className="btn secondary" onClick={()=>{setShowHistory(true);setShowProgress(false);setShowCustomize(false);}}>↺ Match History</button>
          <button className="btn secondary" onClick={()=>{setShowProgress(true);setShowCustomize(false);setShowHistory(false);}}>🏆 Trophies & Ranks</button>
          <button className="btn ghost" onClick={exitRoom}>← Back to menu</button>
        </div>
      </section> :
      <div className="home-grid">
        <section className="panel">
          <div className="section-eyebrow">START A MATCH</div>
          <h2>Choose your battle</h2>
          <label>Game mode<select value={mode} onChange={e=>{setMode(e.target.value);if(e.target.value==='team'&&maxPlayers<4)setMaxPlayers(4);if(e.target.value==='team'&&maxPlayers%2===1)setMaxPlayers(maxPlayers+1);}}>
            <option value="classic">Classic · Balanced Connect 3 / 4</option>
            <option value="speed">⚡ Speed Round · Everyone drops at once!</option>
            <option value="territory">Territory · Score until board is full</option>
            <option value="elimination">Elimination · Previous player is knocked out</option>
            <option value="collapse">Bottom Drop · Clear the floor when stacks rise</option>
            <option value="chaos">Chaos · Drop, Barrier and Blast</option>
             <option value="gravity">🌪 Gravity Shift · Board slides every 4 drops (local preview)</option>
             <option value="power">⚡ Power-Up Arcade · Local preview</option>
            <option value="team">Team Battle · 2v2 / 3v3 / 4v4</option>
          </select></label>
          <p className="balanced-rule-hint">{mode==='team'
            ? 'TEAM BATTLE · Always Connect 4 using teammates’ chips.'
            : 'BALANCED · 2–3 starters: Connect 4 · 4–8 starters: Connect 3. Counts the players who actually start.'}</p>
          <p className="mode-explainer">{mode==='speed'
            ? '⚡ No turn order! Every player drops one chip as fast as possible. The first accepted drop lands first if players choose the same column. Wait until everyone has played, then race again. One minute per round; missing players are skipped.'
            :mode==='elimination'?'Connect 3 with 4+ players or Connect 4 with 2–3. The PREVIOUS active player is eliminated for failing to block. The arena resets with a countdown; last survivor wins.':mode==='collapse'?'When a newly dropped piece reaches the second row from the top, the bottom row vanishes and the rest fall down. Balanced connections determine the winner.':mode==='power'?'Earn energy to activate Bomb, Shield, Freeze and Double Drop. Local hot-seat preview until server support is enabled.':mode==='gravity'?'Every four valid drops, the whole board slides LEFT, then RIGHT, alternating. Chips settle downward and new connections may appear. Local preview; online support requires server rules.':mode==='territory'?'Every line completed earns a point. Highest score on a full board wins.':mode==='chaos'?'Each player has one Barrier and one Blast per match. Both take a turn. The first normal drop to complete the balanced connection wins.':mode==='team'?'Team Gold versus Team Blue. Teammates alternate turns and may combine their own differently colored chips into one line of four. Both teammates earn the win.':'Be the first to connect 4 with 2–3 players or 3 with 4–8 players, in any direction.'}</p>
          <label>Maximum players<select value={maxPlayers} onChange={e=>setMaxPlayers(Number(e.target.value))}>
            {(mode==='team'?[4,6,8]:[2,3,4,5,6,7,8]).map(n=><option key={n} value={n}>{mode==='team'?n/2+'v'+n/2:n+' players'}</option>)}
          </select></label>
          <button className="btn primary full" disabled={busy||!user||mode==='power'||mode==='gravity'} onClick={()=>perform('create',{mode,maxPlayers})}>{mode==='power'||mode==='gravity'?'Online mode requires server rules':'Create online room'}</button>
          <button className="btn secondary full" disabled={mode==='speed'} onClick={()=>setDemo(true)}>
            {mode==='speed'?'Speed Round needs separate devices':'Try local demo'}
          </button>
          {user&&<button className="btn ghost full" onClick={()=>setShowCustomize(true)}>🎨 My board, chips & avatars</button>}
        </section>
        <section className="panel">
          <div className="section-eyebrow">PLAY WITH FRIENDS</div>
          <h2>Join a room</h2>
          <form className="join-room-form" onSubmit={e=>{
            e.preventDefault();
            if(!busy&&user&&joinCode.length===6)void perform('join',{},joinCode);
          }}>
            <label htmlFor="drop-block-room-code">Six-character code</label>
            <input id="drop-block-room-code" value={joinCode} maxLength={6} placeholder="A1B2C3"
              autoCapitalize="characters" autoComplete="off" spellCheck={false}
              inputMode="text" enterKeyHint="join"
              onChange={e=>setJoinCode(e.target.value.toUpperCase().replace(/[^A-F0-9]/g,''))}/>
            <button type="submit" className="btn primary full" disabled={busy||!user||joinCode.length!==6}>
              Join game
            </button>
          </form>
          {user===undefined ? <p className="sub">Checking your PlayVolt account…</p>
           : user ? <p className="sub">Signed in as <b>{profile?.nickname||user.email}</b> · Shared PlayVolt account</p>
           : <div className="auth-area">
            <div className="tabbar"><button onClick={()=>{setAuthTab('sign-in');setMessage('');}} className={authTab==='sign-in'?'selected':''}>Sign in</button>
            <button onClick={()=>{setAuthTab('sign-up');setMessage('');}} className={authTab==='sign-up'?'selected':''}>Sign up</button></div>
            <form onSubmit={auth}>
              {authTab==='sign-up' && <label>Player nickname<input required maxLength={24} minLength={2} value={nickname} onChange={e=>setNickname(e.target.value)}/></label>}
              <label>Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
              <label>Password<input type="password" autoComplete={authTab==='sign-in'?'current-password':'new-password'} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
              <button disabled={busy} className="btn secondary full" type="submit">{authTab==='sign-in'?'Sign in with PlayVolt':'Create PlayVolt account'}</button>
            </form>
            <p className="sub">Have a Dekabess or Pin & Spin account? Use those same credentials here.</p>
           </div>}
        </section>
      </div>}
    </main>
    <footer>DROP & BLOCK <span>·</span> A PLAYVOLT GAME</footer>
    <VersionAlert />
    <TrophyUnlockNotice codes={freshTrophies} onClose={()=>setFreshTrophies([])}
      onView={()=>{setFreshTrophies([]);setShowProgress(true);}} />
  </div>;
}
