import React, { useEffect, useState } from 'react';
import { db, action } from './supabase.js';
import { emptyBoard, dimensions, playLocalTurn, playChaosTurn } from './rules.js';
import { VersionAlert } from './VersionAlert.jsx';
import { ProgressHub, TrophyUnlockNotice } from './ProgressHub.jsx';
import { buildTvDisplayUrl } from './tvLink.js';

const icons = ['','◆','●','▲','■','★','⬡','✦','✳','⬢'];
const colors = ['','Coral','Cyan','Gold','Mint','Violet','Orange','Pink','Silver'];
const hub = 'https://playvolt-hub.pages.dev/';

function Board({ board, width, height, turn, me, onDrop, disabled, readOnly = false, moveKind = 'drop' }) {
  const columns = Array.from({length: width}, (_,i) => i);
  const rows = Array.from({length: height}, (_,i) => i);
  const grid = { gridTemplateColumns: 'repeat(' + width + ', minmax(0, 1fr))' };
  return <div className="board-wrap">
    {!readOnly && <div className="board-controls" style={grid}>
      {columns.map(col => <button key={col} className="drop-arrow" aria-label={'Drop in column ' + (col+1)}
        disabled={disabled || turn !== me || (moveKind==='blast' ? board[(height-1)*width+col]===0 : board[col] !== 0)}
        onClick={() => onDrop(col)}>{moveKind==='blast'?'✹':moveKind==='block'?'⬢':'▼'}</button>)}
    </div>}
    <div className="board" style={grid} role="grid" aria-label="Drop & Block game board">
      {rows.flatMap(row => columns.map(col => {
        const seat = board[row * width + col] || 0;
        return <div className="board-cell" role="gridcell" key={row + '-' + col}>
          <div className={'disc ' + (seat ? 'seat-' + seat : 'empty')}
               aria-label={seat ? 'Player ' + seat : 'Empty'}>{seat ? icons[seat] : ''}</div>
        </div>;
      }))}
    </div>
  </div>;
}

function LocalDemo({ onBack, count, mode }) {
  const [width, height] = dimensions(count);
  const reset = () => ({ board:emptyBoard(width,height), turn:1, scores:Array(count).fill(0), status:'playing', winner:null, eliminated:Array(count).fill(false), roundNumber:1, floorClears:0, lastEvent:'', chaosBlockUsed:Array(count).fill(false), chaosBlastUsed:Array(count).fill(false) });
  const [state, setState] = useState(reset);
  const players = Array.from({length:count},(_,i)=>({seat:i+1,name:'Player '+(i+1),score:state.scores[i],eliminated:state.eliminated[i],chaosBlockUsed:state.chaosBlockUsed[i],chaosBlastUsed:state.chaosBlastUsed[i]}));
  function play(col,kind='drop') { setState(old => mode==='chaos'?playChaosTurn(old,col,count,width,height,kind):playLocalTurn(old,col,count,mode,width,height)); return true; }
  return <div className="panel panel-wide">
    <div className="section-eyebrow">LOCAL PREVIEW · SAME DEVICE</div>
    <h2>{modeName(mode)} · {count} Players</h2>
    <p className="sub">Pass the device around. This demo is offline; your actual online rooms use PlayVolt accounts.</p>
    <GameArea game={{...state,width,height,mode,players,turnSeat:state.turn,meSeat:state.turn,winnerSeat:state.winner}}
      onDrop={play} busy={false}/>
    <div className="actions"><button className="btn ghost" onClick={onBack}>← Back</button>
      <button className="btn primary" onClick={()=>setState(reset)}>Restart</button></div>
  </div>;
}

const modeName = mode => ({ classic: 'Classic', territory: 'Territory', elimination: 'Elimination', collapse: 'Bottom Drop', chaos: 'Chaos' })[mode] || 'Classic';

export function GameArea({game, onDrop, busy, readOnly = false}) {
  const [moveKind,setMoveKind]=useState('drop');
  const current=game.players.find(p=>p.seat===game.meSeat);
  const selectColumn=async col=>{
    const kind=game.mode==='chaos'?moveKind:'drop';
    const ok=await onDrop(col,kind);
    if(ok!==false)setMoveKind('drop');
  };
  const turnPlayer = game.players.find(p=>p.seat===game.turnSeat);
  const winner = game.players.find(p=>p.seat===game.winnerSeat);
  const myTurn = !readOnly && game.status==='playing' && game.turnSeat===game.meSeat;
  return <>
    <div className="roster">{game.players.map(p=><div key={p.seat} className={'player-chip seat-border-' + p.seat + (game.turnSeat===p.seat?' current':'') + (p.eliminated?' eliminated':'')}>
      <span className={'tiny-disc seat-' + p.seat}>{icons[p.seat]}</span>
      <span className="player-label">{p.name}{p.eliminated?' · OUT':game.mode==='territory'?' · '+p.score+' pts':''}</span>
    </div>)}</div>
    {game.mode==='chaos' && <div className="mode-status">CHAOS MODE · ONE BARRIER AND ONE BLAST PER PLAYER PER MATCH</div>}
    {game.mode==='elimination' && <div className="mode-status">ROUND {game.roundNumber || 1} · {game.players.filter(p=>!p.eliminated).length} SURVIVORS</div>}
    {game.mode==='collapse' && <div className="mode-status">BOTTOM ROW DROPS: {game.floorClears || 0} · TRIGGER AT SECOND ROW FROM TOP</div>}
    {game.lastEvent && <div className="round-event" role="status">{game.lastEvent}</div>}
    <div className={'turn-notice' + (myTurn?' is-me':'')}>
      {game.status==='finished' ? (winner ? winner.name+' wins!' : 'Match finished · Draw')
        : myTurn ? 'Your turn — choose a column' : readOnly ? (turnPlayer?.name || 'A player') + ' is playing' : 'Waiting for '+(turnPlayer?.name||'player')+'…'}
    </div>
    {game.mode==='chaos' && !readOnly && <div className="chaos-powers" role="group" aria-label="Choose a Chaos move">
      <button type="button" className={'chaos-power'+(moveKind==='drop'?' selected':'')} onClick={()=>setMoveKind('drop')} disabled={busy}>▼ Normal Drop</button>
      <button type="button" className={'chaos-power'+(moveKind==='block'?' selected':'')} onClick={()=>setMoveKind('block')} disabled={busy||!current||current.chaosBlockUsed||game.status!=='playing'}>⬢ Barrier {current?.chaosBlockUsed?'USED':'1×'}</button>
      <button type="button" className={'chaos-power'+(moveKind==='blast'?' selected':'')} onClick={()=>setMoveKind('blast')} disabled={busy||!current||current.chaosBlastUsed||game.status!=='playing'}>✹ Blast {current?.chaosBlastUsed?'USED':'1×'}</button>
    </div>}
    {game.mode==='chaos' && <p className="chaos-tip">{readOnly?'Players use their limited Chaos powers from their phones.':moveKind==='blast'?'Blast removes the bottom chip of a column, dropping the chips above it. Select a column with chips.':moveKind==='block'?'Barrier places a neutral chip into a column to block connections.':'Normal Drop connects four to win. Choosing a power uses your turn.'}</p>}
    <Board board={game.board} width={game.width} height={game.height}
      turn={game.turnSeat} me={game.meSeat} onDrop={selectColumn}
      disabled={busy || game.status!=='playing'} readOnly={readOnly} moveKind={moveKind}/>
    <div className="board-foot">{game.mode==='territory'?'CONNECT 4 TO SCORE':game.mode==='elimination'?'CONNECT 4 TO ELIMINATE THE NEXT OPPONENT':game.mode==='collapse'?'CONNECT 4 TO WIN · THE BOTTOM ROW DROPS WHEN THE STACK GETS HIGH':game.mode==='chaos'?'DROP, BLOCK OR BLAST · CONNECT 4 TO WIN':'CONNECT 4 TO WIN'} · {game.width} × {game.height}</div>
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
      try { const next=await action('get',room.code); if(alive)setRoom(next); }
      catch { /* temporary network errors must not erase the current match */ }
    };
    const timer=setInterval(refresh,2000);
    const resume=()=>{if(!document.hidden)void refresh();};
    document.addEventListener('visibilitychange',resume);
    return ()=>{alive=false;clearInterval(timer);document.removeEventListener('visibilitychange',resume);};
  },[user?.id,room?.code]);

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
      setRoom(next);setJoinCode(next.code);
      history.replaceState(null,'',location.pathname+'?room='+next.code);
      return true;
    } catch(err) {setMessage(err.message);return false;} finally{setBusy(false);}
  }
  function exitRoom() {
    setRoom(null);setMessage('');
    history.replaceState(null,'',location.pathname);
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
    await db.auth.signOut();setUser(null);setRoom(null);setMessage('');setShowProgress(false);setFreshTrophies([]);
    history.replaceState(null,'',location.pathname);
  }
  return <div className="shell">
    <header className="topbar"><a href={hub} className="back">← PLAYVOLT</a>
      <span className="mini-brand">DROP <b>&</b> BLOCK</span>
      <span className="header-right">{user && <>
        {!demo && <button className="text-btn trophies-nav" onClick={()=>setShowProgress(s=>!s)}>{showProgress?'← Game':'🏆 Trophies & Ranks'}</button>}
        <button className="text-btn" onClick={signOut}>Sign out</button>
      </>}</span>
    </header>
    <main className="content">
      {!room && !demo && !showProgress && <div className="hero">
        <div className="logo-art" aria-hidden="true"><div className="dot-1">◆</div><div className="dot-2">●</div><div className="dot-3">▲</div><div className="dot-4">■</div></div>
        <div className="section-eyebrow">THE MULTIPLAYER STRATEGY SHOWDOWN</div>
        <h1>DROP <span>&</span> BLOCK</h1>
        <p>Drop smart. Block hard.</p>
      </div>}
      {message && <div className="notification" role="status">{message}</div>}
      {showProgress ? <ProgressHub userId={user?.id} refreshSignal={progressRefresh} onBack={()=>setShowProgress(false)}/> :
       demo ? <LocalDemo key={maxPlayers+'-'+mode} onBack={()=>setDemo(false)} count={maxPlayers} mode={mode}/> :
      room ? <section className="panel panel-wide">
        <div className="room-top"><div><div className="section-eyebrow">PRIVATE ROOM</div>
        <h2>{room.code}</h2><p className="sub">{modeName(room.mode)} · Match {room.matchNumber || 1} · {room.players.length}/{room.maxPlayers} players</p></div>
        <button className="btn secondary" onClick={shareRoom}>Invite friends</button></div>
        <div className="tv-launch">
          <span><b>TV Party Mode</b><small>Show the board on your TV; everyone plays on their phone.</small></span>
          <div className="tv-launch-actions">
            <button type="button" className="btn secondary" onClick={openTv} disabled={!room.displayToken}>Open TV</button>
            <button type="button" className="btn ghost" onClick={copyTvUrl} disabled={!room.displayToken}>Copy TV link</button>
          </div>
        </div>
        {room.status==='lobby' ? <>
          <div className="roster">{room.players.map(p=><div key={p.seat} className={'player-chip seat-border-'+p.seat}>
            <span className={'tiny-disc seat-'+p.seat}>{icons[p.seat]}</span>
            <span>{p.name} {p.ready?'✓ Ready':'· Not ready'}</span></div>)}</div>
          <p className="sub lobby-note">{room.matchNumber > 1
            ? 'Rematch ready! Everyone keeps their seat, and the starting player rotates. Confirm you are ready, then the host can start.'
            : 'Invite friends using the room code. Each person joins on their own phone with the same PlayVolt login they already use.'}</p>
          {room.host
            ? <button className="btn primary full" disabled={busy||room.players.length<2||room.players.some(p=>!p.ready)}
                onClick={()=>perform('start')}>Start match</button>
            : <button className="btn primary full" disabled={busy} onClick={()=>perform('ready',{ready:!room.players.find(p=>p.seat===room.meSeat)?.ready})}>
                {room.players.find(p=>p.seat===room.meSeat)?.ready?'Cancel ready':'I’m ready!'}</button>}
        </> : <GameArea game={room} onDrop={(col,kind)=>perform('drop',{column:col,kind})} busy={busy}/>}
        {room.status==='finished' && <div className="rematch-panel">
          <div className="rematch-copy"><strong>Match {room.matchNumber || 1} complete</strong>
            <span>Keep this room and all the same players. Results and match history are saved.</span></div>
          {room.host
            ? <button className="btn primary" disabled={busy} onClick={()=>perform('rematch')}>
                Play again · Same players
              </button>
            : <span className="rematch-waiting">Waiting for the host to start the next match…</span>}
        </div>}
        <div className="actions">
          <button className="btn secondary" onClick={()=>setShowProgress(true)}>🏆 Trophies & Ranks</button>
          <button className="btn ghost" onClick={exitRoom}>← Back to menu</button>
        </div>
      </section> :
      <div className="home-grid">
        <section className="panel">
          <div className="section-eyebrow">START A MATCH</div>
          <h2>Choose your battle</h2>
          <label>Game mode<select value={mode} onChange={e=>setMode(e.target.value)}>
            <option value="classic">Classic · First to connect four</option>
            <option value="territory">Territory · Score until board is full</option>
            <option value="elimination">Elimination · Connect 4 to knock out a rival</option>
            <option value="collapse">Bottom Drop · Clear the floor when stacks rise</option>
            <option value="chaos">Chaos · Drop, Barrier and Blast</option>
          </select></label>
          <p className="mode-explainer">{mode==='elimination'?'Connect four to eliminate the next active rival. The board resets each round; last player standing wins.':mode==='collapse'?'When a newly dropped piece reaches the second row from the top, the bottom row vanishes and the rest fall down. Connect four to win.':mode==='territory'?'Every line completed earns a point. Highest score on a full board wins.':mode==='chaos'?'Each player has one Barrier and one Blast per match. Both take a turn. The first normal drop to connect four wins.':'Be the first to connect four in any direction.'}</p>
          <label>Maximum players<select value={maxPlayers} onChange={e=>setMaxPlayers(Number(e.target.value))}>
            {[2,3,4,5,6,7,8].map(n=><option key={n} value={n}>{n} players</option>)}
          </select></label>
          <button className="btn primary full" disabled={busy||!user} onClick={()=>perform('create',{mode,maxPlayers})}>Create online room</button>
          <button className="btn secondary full" onClick={()=>setDemo(true)}>Try local demo</button>
        </section>
        <section className="panel">
          <div className="section-eyebrow">PLAY WITH FRIENDS</div>
          <h2>Join a room</h2>
          <label>Six-character code<input value={joinCode} maxLength={6} placeholder="A1B2C3"
            onChange={e=>setJoinCode(e.target.value.toUpperCase().replace(/[^A-F0-9]/g,''))}/></label>
          <button className="btn primary full" disabled={busy||!user||joinCode.length!==6}
            onClick={()=>perform('join',{},joinCode)}>Join game</button>
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
