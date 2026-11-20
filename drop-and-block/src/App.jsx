import React, { useEffect, useState } from 'react';
import { db, action } from './supabase.js';
import { emptyBoard, dimensions, playLocalTurn, playChaosTurn, playTeamTurn, teamOfSeat } from './rules.js';
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

const icons = ['','◆','●','▲','■','★','⬡','✦','✳','⬢'];
const colors = ['','Coral','Cyan','Gold','Mint','Violet','Orange','Pink','Silver'];
const hub = 'https://playvolt-hub.pages.dev/';

function Board({ board, width, height, turn, me, onDrop, disabled, readOnly = false, moveKind = 'drop', teamMode = false, players=[], boardTheme='deep-navy', lastMove=null, winnerSeat=null, status='playing', mode='classic' }) {
  const columns = Array.from({length: width}, (_,i) => i);
  const rows = Array.from({length: height}, (_,i) => i);
  const grid = { gridTemplateColumns: 'repeat(' + width + ', minmax(0, 1fr))' };
  const minWidth=wideBoardMinWidth(width,readOnly);
  const available=col=>canPlayColumn(board,width,height,col,moveKind,disabled||turn!==me);
  const actionLabel=moveKind==='blast'?'Blast':'Place '+(moveKind==='block'?'barrier':'chip');
  const lastCell=lastMoveCell(board,width,height,lastMove);
  const winning=new Set(status==='finished'?winningCells(board,width,height,winnerSeat,mode,lastMove):[]);
  const effectColumn=lastMove?.column!==undefined&&(lastMove.kind==='blast'||lastCell===null)
    ?lastMove.column:null;
  return <div className="board-wrap">
    <div className={'board-scroll'+(minWidth?' is-wide':'')}
      role={minWidth?'region':undefined} aria-label={minWidth?'Swipe horizontally to view the entire game board':undefined}
      tabIndex={minWidth?0:undefined}>
      <div className="board-inner" style={minWidth?{minWidth:minWidth+'px'}:undefined}>
        {!readOnly&&<div className="board-controls" style={grid}>
          {columns.map(col=><button type="button" key={col} className={'drop-arrow'+(lastMove?.column===col?' recently-used':'')}
            aria-label={actionLabel+' in column '+(col+1)}
            disabled={!available(col)} onClick={()=>onDrop(col)}>
            {moveKind==='blast'?'✹':moveKind==='block'?'⬢':'▼'}
          </button>)}
        </div>}
        <div className="board-tap-area">
          <div className={'board board-theme-'+safeBoard(boardTheme)} style={grid} role="grid" aria-label="Drop & Block game board">
            {rows.flatMap(row=>columns.map(col=>{
              const seat=board[row*width+col]||0;
              const index=row*width+col;
              const isWinner=winning.has(index),isRecent=lastCell===index;
              return <div className={'board-cell'+(isWinner?' winning-slot':'')+
                (isRecent?' last-played-slot':'')+(effectColumn===col?' move-effect-column':'')}
                role="gridcell" key={row+'-'+col}
                title={isWinner?'Winning connection':isRecent?'Most recent chip':undefined}>
                <ChipDisc seat={seat} style={players.find(p=>p.seat===seat)?.chipStyle||'round'} teamMode={teamMode}/>
              </div>;
            }))}
          </div>
          {!readOnly&&<div className="board-tap-columns" style={grid} role="group" aria-label="Tap a board column to place a piece">
            {columns.map(col=><button type="button" key={col} className="board-tap-column"
              aria-label={actionLabel+' in column '+(col+1)} disabled={!available(col)}
              onClick={()=>onDrop(col)}/>)}
          </div>}
        </div>
      </div>
    </div>
    {!readOnly&&<p className="board-mobile-hint">
      Tap anywhere in a column to play{minWidth?' · Swipe sideways to see the whole board':''}
    </p>}
  </div>;
}

function LocalDemo({ onBack, count, mode, loadout }) {
  const [width, height] = dimensions(count);
  const reset = () => ({ board:emptyBoard(width,height), turn:1, scores:Array(count).fill(0), status:'playing', winner:null, winnerTeam:null, eliminated:Array(count).fill(false), roundNumber:1, floorClears:0, lastEvent:'', lastMove:null, moveCount:0, matchNumber:1, chaosBlockUsed:Array(count).fill(false), chaosBlastUsed:Array(count).fill(false) });
  const [state, setState] = useState(reset);
  const players = Array.from({length:count},(_,i)=>({seat:i+1,name:'Player '+(i+1),score:state.scores[i],eliminated:state.eliminated[i],chaosBlockUsed:state.chaosBlockUsed[i],chaosBlastUsed:state.chaosBlastUsed[i],avatarStyle:i===0?loadout?.avatar:'sentinel',chipStyle:i===0?loadout?.chip:'round'}));
  function play(col,kind='drop') {
    setState(old=>{
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
      return {...next,moveCount:(old.moveCount||0)+1,
        lastMove:{seat:old.turn,column:col,row,kind,
          earned:(next.scores?.[old.turn-1]||0)-(old.scores?.[old.turn-1]||0)}};
    });
    return true;
  }
  return <div className="panel panel-wide">
    <div className="section-eyebrow">LOCAL PREVIEW · SAME DEVICE</div>
    <h2>{modeName(mode)} · {count} Players</h2>
    <p className="sub">Pass the device around. This demo is offline; your actual online rooms use PlayVolt accounts.</p>
    <GameArea game={{...state,width,height,mode,players,turnSeat:state.turn,meSeat:state.turn,winnerSeat:state.winner}} boardTheme={loadout?.board}
      onDrop={play} busy={false}/>
    <div className="actions"><button className="btn ghost" onClick={onBack}>← Back</button>
      <button className="btn primary" onClick={()=>setState(reset)}>Restart</button></div>
  </div>;
}

const modeName = mode => ({ speed: 'Speed Round', classic: 'Classic', territory: 'Territory', elimination: 'Elimination', collapse: 'Bottom Drop', chaos: 'Chaos', team: 'Team Battle' })[mode] || 'Classic';

export function GameArea({game, onDrop, busy, readOnly = false, boardTheme}) {
  const [moveKind,setMoveKind]=useState('drop');
  const current=game.players.find(p=>p.seat===game.meSeat);
  const selectColumn=async col=>{
    const kind=game.mode==='chaos'?moveKind:'drop';
    const ok=await onDrop(col,kind);
    if(ok!==false)setMoveKind('drop');
  };
  const turnPlayer = game.players.find(p=>p.seat===game.turnSeat);
  const winner = game.players.find(p=>p.seat===game.winnerSeat);
  const lastPlayer=game.players.find(p=>p.seat===game.lastMove?.seat);
  const lastMoveLabel=game.lastMove?.kind==='blast'?'used Blast on':
    game.lastMove?.kind==='block'?'placed a Barrier in':'played';
  const isSpeed=game.mode==='speed';
  const speedState=speedRoundState(game,game.meSeat);
  const speedSignal=useSpeedStartSignal(game);
  const submitted=speedState.submitted;
  const iSubmitted=isSpeed&&speedState.alreadyPlayed;
  const myTurn=!readOnly&&game.status==='playing'&&
    (isSpeed?speedState.canSubmit&&speedSignal.phase!=='countdown':game.turnSeat===game.meSeat);
  return <>
    <div className="roster">{game.players.map(p=><div key={p.seat} className={'player-chip seat-border-' + p.seat + (game.turnSeat===p.seat?' current':'')+(isSpeed&&submitted.has(p.seat)?' speed-submitted':'') + (p.eliminated?' eliminated':'')+(game.mode==='team'?' team-roster-'+teamOfSeat(p.seat):'')}>
      <AvatarBadge id={p.avatarStyle||'sentinel'} small/><span className={'tiny-disc seat-'+p.seat}>{icons[p.seat]}</span>
      <span className="player-label">{p.name}{p.eliminated?' · OUT':game.mode==='team'?' · '+(teamOfSeat(p.seat)===1?'Gold':'Blue'):game.mode==='territory'?' · '+p.score+' pts':''}
       {isSpeed&&game.status==='playing'&&<small className={'speed-roster-status'+(submitted.has(p.seat)?' placed':' waiting')}>
          {submitted.has(p.seat)?'#'+(speedState.positionBySeat.get(p.seat)||'')+' · Dropped':'⚡ Ready to drop'}
        </small>}
       {p.online!==undefined&&<small className={'player-presence '+(p.online?'online':'away')}>{p.online?'● Online':'○ Away'}{p.timedOutTurns>0?' · '+p.timedOutTurns+' missed':''}</small>}
      </span>
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
    {game.lastEvent && <div className="round-event" role="status">{game.lastEvent}</div>}
    {isSpeed&&<SpeedStartSignal signal={speedSignal} round={game.roundNumber||1}/>}
    {(!isSpeed||speedSignal.phase!=='countdown')&&<TurnClock game={game}/>}

    {game.lastMove&&<div className="last-move-caption">
      <span className="last-move-tag">LAST MOVE</span>
      <span>{lastPlayer?.name||'Player '+game.lastMove.seat} {lastMoveLabel} column {game.lastMove.column+1}
        {game.lastMove.earned>0?' · '+game.lastMove.earned+' line'+(game.lastMove.earned===1?'':'s')+' connected':''}</span>
    </div>}
    <div className={'turn-notice' + (myTurn?' is-me':'')}>
      {game.status==='cancelled' ? (isNoContest(game) ? 'No Contest · Match ended without a winner' : 'Room closed by the host')
        : game.status==='finished' ? (game.mode==='team' ? (game.winnerTeam || winner ? 'Team '+((game.winnerTeam || teamOfSeat(winner?.seat))===1?'Gold':'Blue')+' wins!' : 'Match finished · Draw') : (winner ? winner.name+' wins!' : 'Match finished · Draw'))
        : isSpeed
          ? speedSignal.phase==='countdown'?'GET READY · DROP ONLY WHEN YOU SEE GO!'
            : readOnly?'ALL PLAYERS CAN DROP NOW · FIRST CHIP GOES FIRST'
            : iSubmitted?'✓ CHIP LOCKED IN · WAITING FOR EVERYONE ELSE'
            : '⚡ DROP NOW · FIRST ACCEPTED CHIP LANDS FIRST!'
          : myTurn ? 'Your turn — choose a column' : readOnly ? (turnPlayer?.name || 'A player') + ' is playing' : 'Waiting for '+(turnPlayer?.name||'player')+'…'}
    </div>
    <MatchSpotlight game={game}/>
    {game.mode==='chaos' && !readOnly && <div className="chaos-powers" role="group" aria-label="Choose a Chaos move">
      <button type="button" className={'chaos-power'+(moveKind==='drop'?' selected':'')} onClick={()=>setMoveKind('drop')} disabled={busy}>▼ Normal Drop</button>
      <button type="button" className={'chaos-power'+(moveKind==='block'?' selected':'')} onClick={()=>setMoveKind('block')} disabled={busy||!current||current.chaosBlockUsed||game.status!=='playing'}>⬢ Barrier {current?.chaosBlockUsed?'USED':'1×'}</button>
      <button type="button" className={'chaos-power'+(moveKind==='blast'?' selected':'')} onClick={()=>setMoveKind('blast')} disabled={busy||!current||current.chaosBlastUsed||game.status!=='playing'}>✹ Blast {current?.chaosBlastUsed?'USED':'1×'}</button>
    </div>}
    {game.mode==='chaos' && <p className="chaos-tip">{readOnly?'Players use their limited Chaos powers from their phones.':moveKind==='blast'?'Blast removes the bottom chip of a column, dropping the chips above it. Select a column with chips.':moveKind==='block'?'Barrier places a neutral chip into a column to block connections.':'Normal Drop connects four to win. Choosing a power uses your turn.'}</p>}
    <Board board={game.board} width={game.width} height={game.height}
      turn={isSpeed?game.meSeat:game.turnSeat} me={game.meSeat} onDrop={selectColumn}
      disabled={busy || game.status!=='playing'||iSubmitted||(isSpeed&&speedSignal.phase==='countdown')} readOnly={readOnly} moveKind={moveKind} teamMode={game.mode==='team'} players={game.players} boardTheme={boardTheme||game.hostBoardTheme}
      lastMove={game.lastMove} winnerSeat={game.winnerSeat} status={game.status} mode={game.mode}/>
    <div className="board-foot">{isSpeed?'ONE CHIP EACH PER ROUND · FASTEST SERVER-ACCEPTED DROP GOES FIRST · CONNECT FOUR TO WIN':game.mode==='territory'?'CONNECT 4 TO SCORE':game.mode==='elimination'?'CONNECT 4 TO ELIMINATE THE NEXT OPPONENT':game.mode==='collapse'?'CONNECT 4 TO WIN · THE BOTTOM ROW DROPS WHEN THE STACK GETS HIGH':game.mode==='chaos'?'DROP, BLOCK OR BLAST · CONNECT 4 TO WIN':game.mode==='team'?'CONNECT FOUR TEAM CHIPS TO WIN · TEAMMATES SHARE THE VICTORY':'CONNECT 4 TO WIN'} · {game.width} × {game.height}</div>
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

  useEffect(()=>{
    if(!user || !room?.code) return undefined;
    let alive=true;
    const refresh=async()=>{
      try {
        const next=await action('get',room.code);
        if(alive){setRoom(next);setSyncStatus('connected');}
      } catch {
        // Retain current match information while the connection is down.
        if(alive)setSyncStatus('reconnecting');
      }
    };
    const timer=setInterval(refresh,room?.mode==='speed'?1100:2000);
    const resume=()=>{if(!document.hidden)void refresh();};
    const onOnline=()=>void refresh();
    document.addEventListener('visibilitychange',resume);
    window.addEventListener('online',onOnline);
    return ()=>{alive=false;clearInterval(timer);document.removeEventListener('visibilitychange',resume);
      window.removeEventListener('online',onOnline);};
  },[user?.id,room?.code,room?.mode]);

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
      setRoom(next);setJoinCode(next.code);setSyncStatus('connected');
      history.replaceState(null,'',location.pathname+'?room='+next.code);
      return true;
    } catch(err) {setMessage(err.message);return false;} finally{setBusy(false);}
  }
  function exitRoom() {
    setRoom(null);setMessage('');setSyncStatus('connected');setMenuOpen(false);
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
    await db.auth.signOut();setUser(null);setRoom(null);setMessage('');setShowProgress(false);setShowCustomize(false);setShowHistory(false);setMenuOpen(false);setMyLoadout(null);setFreshTrophies([]);
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
        <h2>{room.code}</h2><p className="sub">{modeName(room.mode)} · Match {room.matchNumber || 1} · {room.players.length}/{room.maxPlayers} players</p></div>
        <div className="room-share-actions">
          <button type="button" className="btn ghost" onClick={copyRoomCode}>Copy code</button>
          <button type="button" className="btn secondary" onClick={shareRoom}>Invite friends</button>
        </div></div>
        <div className={'room-sync '+(syncStatus==='connected'?'is-connected':'is-reconnecting')} role="status">
          <span aria-hidden="true">{syncStatus==='connected'?'●':'◌'}</span>
          {syncStatus==='connected'?'Room connected · Live updates':'Connection interrupted · Trying to reconnect'}
          {syncStatus!=='connected'&&<button type="button" onClick={async()=>{
             try{const next=await action('get',room.code);setRoom(next);setSyncStatus('connected');}
             catch{setMessage('Still offline. Check your connection and try again.');}
          }}>Retry now</button>}
        </div>
        <div className="tv-launch">
          <span><b>TV Party Mode</b><small>Show the board on your TV; everyone plays on their phone.</small></span>
          <div className="tv-launch-actions">
            <button type="button" className="btn secondary" onClick={openTv} disabled={!room.displayToken}>Open TV</button>
            <button type="button" className="btn ghost" onClick={copyTvUrl} disabled={!room.displayToken}>Copy TV link</button>
          </div>
        </div>
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
            <option value="classic">Classic · First to connect four</option>
            <option value="speed">⚡ Speed Round · Everyone drops at once!</option>
            <option value="territory">Territory · Score until board is full</option>
            <option value="elimination">Elimination · Connect 4 to knock out a rival</option>
            <option value="collapse">Bottom Drop · Clear the floor when stacks rise</option>
            <option value="chaos">Chaos · Drop, Barrier and Blast</option>
            <option value="team">Team Battle · 2v2 / 3v3 / 4v4</option>
          </select></label>
          <p className="mode-explainer">{mode==='speed'
            ? '⚡ No turn order! Every player drops one chip as fast as possible. The first accepted drop lands first if players choose the same column. Wait until everyone has played, then race again. One minute per round; missing players are skipped.'
            :mode==='elimination'?'Connect four to eliminate the next active rival. The board resets each round; last player standing wins.':mode==='collapse'?'When a newly dropped piece reaches the second row from the top, the bottom row vanishes and the rest fall down. Connect four to win.':mode==='territory'?'Every line completed earns a point. Highest score on a full board wins.':mode==='chaos'?'Each player has one Barrier and one Blast per match. Both take a turn. The first normal drop to connect four wins.':mode==='team'?'Team Gold versus Team Blue. Teammates alternate turns and may combine their own differently colored chips into one line of four. Both teammates earn the win.':'Be the first to connect four in any direction.'}</p>
          <label>Maximum players<select value={maxPlayers} onChange={e=>setMaxPlayers(Number(e.target.value))}>
            {(mode==='team'?[4,6,8]:[2,3,4,5,6,7,8]).map(n=><option key={n} value={n}>{mode==='team'?n/2+'v'+n/2:n+' players'}</option>)}
          </select></label>
          <button className="btn primary full" disabled={busy||!user} onClick={()=>perform('create',{mode,maxPlayers})}>Create online room</button>
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
