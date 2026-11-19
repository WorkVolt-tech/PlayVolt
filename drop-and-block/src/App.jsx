import React, { useEffect, useState } from 'react';
import { db, action } from './supabase.js';
import { emptyBoard, drop, dimensions } from './rules.js';

const icons = ['','◆','●','▲','■','★','⬡','✦','✳'];
const colors = ['','Coral','Cyan','Gold','Mint','Violet','Orange','Pink','Silver'];
const hub = 'https://playvolt-hub.pages.dev/';

function Board({ board, width, height, turn, me, onDrop, disabled }) {
  const columns = Array.from({length: width}, (_,i) => i);
  const rows = Array.from({length: height}, (_,i) => i);
  const grid = { gridTemplateColumns: 'repeat(' + width + ', minmax(0, 1fr))' };
  return <div className="board-wrap">
    <div className="board-controls" style={grid}>
      {columns.map(col => <button key={col} className="drop-arrow" aria-label={'Drop in column ' + (col+1)}
        disabled={disabled || turn !== me || board[col] !== 0}
        onClick={() => onDrop(col)}>▼</button>)}
    </div>
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
  const [state, setState] = useState(() => ({ board:emptyBoard(width,height), turn:1, scores:Array(count).fill(0), status:'playing',winner:null }));
  const players = Array.from({length:count},(_,i)=>({seat:i+1,name:'Player '+(i+1),score:state.scores[i]}));
  function play(col) {
    setState(old => {
      if (old.status !== 'playing') return old;
      const move = drop(old.board,width,height,col,old.turn);
      if (!move) return old;
      const scores = [...old.scores];
      scores[old.turn-1] += move.points;
      const done = mode==='classic' && move.points>0 || move.board.every(Boolean);
      const high = Math.max(...scores);
      const winner = mode==='classic' && move.points>0 ? old.turn
        : move.board.every(Boolean) && scores.filter(s=>s===high).length===1 ? scores.indexOf(high)+1 : null;
      return {board:move.board,scores,status:done?'finished':'playing',winner,turn:done?null:old.turn%count+1};
    });
  }
  return <div className="panel panel-wide">
    <div className="section-eyebrow">LOCAL PREVIEW · SAME DEVICE</div>
    <h2>{mode==='classic'?'Classic':'Territory'} · {count} Players</h2>
    <p className="sub">Pass the device around. This demo is offline; your actual online rooms use PlayVolt accounts.</p>
    <GameArea game={{...state,width,height,mode,players,turnSeat:state.turn,meSeat:state.turn,winnerSeat:state.winner}}
      onDrop={play} busy={false}/>
    <div className="actions"><button className="btn ghost" onClick={onBack}>← Back</button>
      <button className="btn primary" onClick={()=>setState({board:emptyBoard(width,height),turn:1,scores:Array(count).fill(0),status:'playing',winner:null})}>Restart</button></div>
  </div>;
}

function GameArea({game, onDrop, busy}) {
  const turnPlayer = game.players.find(p=>p.seat===game.turnSeat);
  const winner = game.players.find(p=>p.seat===game.winnerSeat);
  const myTurn = game.status==='playing' && game.turnSeat===game.meSeat;
  return <>
    <div className="roster">{game.players.map(p=><div key={p.seat} className={'player-chip seat-border-' + p.seat + (game.turnSeat===p.seat?' current':'')}>
      <span className={'tiny-disc seat-' + p.seat}>{icons[p.seat]}</span>
      <span className="player-label">{p.name}{game.mode==='territory'?' · '+p.score+' pts':''}</span>
    </div>)}</div>
    <div className={'turn-notice' + (myTurn?' is-me':'')}>
      {game.status==='finished' ? (winner ? winner.name+' wins!' : 'Match finished · Draw')
        : myTurn ? 'Your turn — choose a column' : 'Waiting for '+(turnPlayer?.name||'player')+'…'}
    </div>
    <Board board={game.board} width={game.width} height={game.height}
      turn={game.turnSeat} me={game.meSeat} onDrop={onDrop}
      disabled={busy || game.status!=='playing'}/>
    <div className="board-foot">CONNECT 4 TO WIN {game.mode==='territory'?'POINTS':'THE MATCH'} · {game.width} × {game.height}</div>
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
  async function shareRoom() {
    if(!room)return;
    const link=location.origin+location.pathname+'?room='+room.code;
    try{if(navigator.share){await navigator.share({title:'Drop & Block',text:'Join my room: '+room.code,url:link});}
      else {await navigator.clipboard.writeText(link);setMessage('Room link copied!');}}
    catch(err){if(err.name!=='AbortError')setMessage('Room code: '+room.code);}
  }
  async function signOut() {
    await db.auth.signOut();setUser(null);setRoom(null);setMessage('');
    history.replaceState(null,'',location.pathname);
  }
  return <div className="shell">
    <header className="topbar"><a href={hub} className="back">← PLAYVOLT</a>
      <span className="mini-brand">DROP <b>&</b> BLOCK</span>
      <span className="header-right">{user && <button className="text-btn" onClick={signOut}>Sign out</button>}</span>
    </header>
    <main className="content">
      {!room && !demo && <div className="hero">
        <div className="logo-art" aria-hidden="true"><div className="dot-1">◆</div><div className="dot-2">●</div><div className="dot-3">▲</div><div className="dot-4">■</div></div>
        <div className="section-eyebrow">THE MULTIPLAYER STRATEGY SHOWDOWN</div>
        <h1>DROP <span>&</span> BLOCK</h1>
        <p>Drop smart. Block hard.</p>
      </div>}
      {message && <div className="notification" role="status">{message}</div>}
      {demo ? <LocalDemo key={maxPlayers+'-'+mode} onBack={()=>setDemo(false)} count={maxPlayers} mode={mode}/> :
      room ? <section className="panel panel-wide">
        <div className="room-top"><div><div className="section-eyebrow">PRIVATE ROOM</div>
        <h2>{room.code}</h2><p className="sub">{room.mode==='classic'?'Classic':'Territory'} · {room.players.length}/{room.maxPlayers} players</p></div>
        <button className="btn secondary" onClick={shareRoom}>Invite friends</button></div>
        {room.status==='lobby' ? <>
          <div className="roster">{room.players.map(p=><div key={p.seat} className={'player-chip seat-border-'+p.seat}>
            <span className={'tiny-disc seat-'+p.seat}>{icons[p.seat]}</span>
            <span>{p.name} {p.ready?'✓ Ready':'· Not ready'}</span></div>)}</div>
          <p className="sub lobby-note">Invite friends using the room code. Each person joins on their own phone with the same PlayVolt login they already use.</p>
          {room.host
            ? <button className="btn primary full" disabled={busy||room.players.length<2||room.players.some(p=>!p.ready)}
                onClick={()=>perform('start')}>Start match</button>
            : <button className="btn primary full" disabled={busy} onClick={()=>perform('ready',{ready:!room.players.find(p=>p.seat===room.meSeat)?.ready})}>
                {room.players.find(p=>p.seat===room.meSeat)?.ready?'Cancel ready':'I’m ready!'}</button>}
        </> : <GameArea game={room} onDrop={col=>perform('drop',{column:col})} busy={busy}/>}
        <div className="actions"><button className="btn ghost" onClick={exitRoom}>← Back to menu</button></div>
      </section> :
      <div className="home-grid">
        <section className="panel">
          <div className="section-eyebrow">START A MATCH</div>
          <h2>Choose your battle</h2>
          <label>Game mode<select value={mode} onChange={e=>setMode(e.target.value)}>
            <option value="classic">Classic · First to connect four</option>
            <option value="territory">Territory · Score until board is full</option>
          </select></label>
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
  </div>;
}
