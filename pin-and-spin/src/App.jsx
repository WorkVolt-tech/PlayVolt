import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const API = 'https://eybzbtyfafmqbkulyvog.supabase.co/functions/v1/pin-and-spin';
const SESSION_KEY = 'pin_and_spin_session_v1';
const NAME_KEY = 'pin_and_spin_nickname';
const DRAFT_KEY = 'pin_and_spin_draft_v1';
const COLORS = [
  { name: 'Blue', hex: '#52adff', glyph: '✚' },
  { name: 'Red', hex: '#ff5579', glyph: '▦' },
  { name: 'Green', hex: '#62e5a0', glyph: '▲' },
  { name: 'Yellow', hex: '#ffdc55', glyph: '✦' },
  { name: 'Purple', hex: '#b987ff', glyph: '⬟' },
  { name: 'White', hex: '#e8eef9', glyph: '═' },
];
const MODES = {
  classic: { label: 'Classic', color: 0, icon: '↪', hint: 'Take turns · 4 guesses', description: 'A random player starts each game, including rematches. Take turns trying the same secret code. Each player gets four guesses. Guesses and clues appear immediately. First to solve wins.' },
  reveal: { label: 'Reveal', color: 1, icon: '◉', hint: 'Guess together · 4 guesses', description: 'Everyone submits privately at the same time. All guesses and clues reveal together after everyone submits. Players who solve in the same reveal share the win.' },
  'timed-reveal': { label: 'Timed Reveal', color: 3, icon: '◷', hint: '3 minutes per guess · 4 guesses', description: 'A fresh three-minute timer starts for EACH simultaneous guess. Reveal when everyone submits or time runs out. Missing a deadline uses that guess; you can play the next one. Same-reveal solvers tie.' },
  rush: { label: 'Rush', color: 2, icon: 'ϟ', hint: '3 minutes total · 8 guesses', description: 'Play at your own pace for three minutes total, with up to eight guesses each. Everyone’s submitted guesses and clues are visible live. The first correct submission wins.' },
};
const EMPTY_GUESS = [null, null, null, null];

function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('');
}
function savedSession() {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    const invitedRoom = new URLSearchParams(location.search).get('room')?.toUpperCase();
    if (invitedRoom && invitedRoom !== value?.code) return null;
    return value && /^[a-f0-9]{64}$/.test(value.token) && /^[A-F0-9]{6}$/.test(value.code)
      ? value : null;
  } catch {
    return null;
  }
}
function savedName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}
async function callGame(action, session, data = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 13000);
  try {
    const response = await fetch(API, {
      method: 'POST', cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        code: session.code || '',
        token: session.token,
        data,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) {
      throw new Error(payload.error || 'The game service could not complete this request.');
    }
    return payload;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The server took too long. Try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
function Empty({ children }) {
  return <div className="empty-state">{children}</div>;
}
function Peg({ value, tiny = false }) {
  const color = value == null ? null : COLORS[Number(value)];
  if (!color) return <span className={tiny ? 'tiny-peg empty-peg' : 'slot'} aria-label="Empty slot">·</span>;
  return tiny
    ? <span className={`tiny-peg patterned-peg color-${value}`} title={color.name} aria-label={color.name}
        style={{ '--color': color.hex }}><span className="peg-glyph" aria-hidden="true">{color.glyph}</span></span>
    : <span className={`slot filled patterned-peg color-${value}`} title={color.name} aria-label={color.name} style={{ '--slot-color': color.hex, '--color': color.hex }}>
        <span className="peg-glyph" aria-hidden="true">{color.glyph}</span>
      </span>;
}
function PegRow({ colors, tiny = false }) {
  return <div className={tiny ? 'tiny-pegs' : 'slots answer-slots'}>
    {(colors || []).map((value, index) => <Peg key={index} value={value} tiny={tiny} />)}
  </div>;
}
function Feedback({ guess }) {
  if (guess && !guess.revealed) return <span className="pending">SEALED</span>;
  if (guess && !guess.colors) return <span className="pending">MISSED</span>;
  const pins = guess?.pins || 0, spins = guess?.spins || 0;
  return <span className="feedback-dots" role="img" aria-label={guess ? `${pins} Pins, ${spins} Spins` : 'No feedback yet'}>
    {Array.from({ length: 4 }, (_, i) => <i key={i} className={i < pins ? 'pin-dot' : i < pins + spins ? 'spin-dot' : ''} />)}
  </span>;
}
function GuessRow({ guess, label }) {
  return <div className="guess-item">
    <div className="guess-id"><b>{label}</b><small>TRY {guess.attempt}</small></div>
    <PegRow colors={guess.colors || EMPTY_GUESS} tiny />
    <div className="score"><Feedback guess={guess} /></div>
  </div>;
}

function CodeBoard({ mine, limit, attempt, canSubmit, draft, selected, onSelect }) {
  return <div className="code-board" aria-label="Your guess board">
    {Array.from({ length: limit }, (_, i) => {
      const guess = mine.find((g) => g.attempt === i + 1);
      const active = canSubmit && attempt === i + 1;
      const colors = !guess && attempt === i + 1 ? draft : guess?.colors || EMPTY_GUESS;
      return <div className={'code-row' + (active ? ' current' : '')} key={i}>
        <span className="attempt-number">{i + 1}</span>
        <div className="code-slots">
          {colors.map((value, index) => active
            ? <button type="button" key={index} className={'code-slot' + (selected === index ? ' selected' : '')}
                aria-label={`Slot ${index + 1}: ${value === null ? 'empty' : COLORS[value].name}`}
                aria-pressed={selected === index} onClick={() => onSelect(index)}>
                <Peg value={value} tiny />
              </button>
            : <Peg key={index} value={value} tiny />)}
        </div>
        <Feedback guess={guess} />
      </div>;
    })}
  </div>;
}

export default function App() {
  const [session, setSession] = useState(savedSession);
  const [game, setGame] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formTab, setFormTab] = useState('home');
  const [nickname, setNickname] = useState(savedName);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [mode, setMode] = useState('classic');
  const [view, setView] = useState('play');
  const [draft, setDraft] = useState(EMPTY_GUESS);
  const [selected, setSelected] = useState(0);
  const [toast, setToast] = useState('');
  const [clock, setClock] = useState(Date.now());
  const [playerFilter, setPlayerFilter] = useState('all');
  const sessionRef = useRef(session);
  const gameRef = useRef(game);
  const busyRef = useRef(false);
  const pollingRef = useRef(false);
  const offsetRef = useRef(0);
  const lastWarningRef = useRef(0);
  const requestVersionRef = useRef(0);
  const draftIdRef = useRef('');

  const notify = useCallback((message) => setToast(message), []);
  const resetDraft = useCallback(() => {
    setDraft([...EMPTY_GUESS]);
    setSelected(0);
  }, []);
  const updateGame = useCallback((next) => {
    if (!next?.code) return;
    const old = gameRef.current;
    gameRef.current = next;
    offsetRef.current = new Date(next.serverTime || Date.now()).getTime() - Date.now();
    const nextAttempt = ['reveal', 'timed-reveal'].includes(next.mode) ? next.round
      : next.guesses.filter((guess) => guess.playerId === next.me).length + 1;
    const draftId = `${next.code}:${next.puzzle}:${nextAttempt}`;
    if (draftIdRef.current !== draftId) {
      draftIdRef.current = draftId;
      let saved;
      try { saved = JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch { /* Optional draft recovery. */ }
      if (saved?.id === draftId && Array.isArray(saved.colors) && saved.colors.length === 4 &&
        saved.colors.every((c) => c === null || Number.isInteger(c) && c >= 0 && c < 6)) {
        setDraft(saved.colors);
        setSelected(Math.max(0, saved.colors.indexOf(null)));
      } else resetDraft();
    }
    if (old?.status === 'lobby' && next.status === 'playing') setView('play');
    setGame(next);
    setClock(Date.now());
  }, [resetDraft]);
  const forget = useCallback(() => {
    requestVersionRef.current += 1;
    sessionRef.current = null;
    gameRef.current = null;
    setSession(null);
    setGame(null);
    setView('play');
    setFormTab('home');
    resetDraft();
    try { localStorage.removeItem(SESSION_KEY); localStorage.removeItem(DRAFT_KEY); } catch { /* Storage may be disabled. */ }
    history.replaceState(null, '', location.pathname);
  }, [resetDraft]);
  const refresh = useCallback(async () => {
    if (!sessionRef.current || busyRef.current || pollingRef.current) return;
    pollingRef.current = true;
    const version = requestVersionRef.current;
    const currentSession = sessionRef.current;
    try {
      const next = await callGame('state', currentSession);
      if (!busyRef.current && version === requestVersionRef.current && currentSession === sessionRef.current) updateGame(next);
    } catch (error) {
      if (version !== requestVersionRef.current || currentSession !== sessionRef.current) return;
      if (/not found|expired|no longer in this room/i.test(error.message || '')) {
        forget();
        notify('That room is no longer available.');
      } else if (Date.now() - lastWarningRef.current > 20000) {
        lastWarningRef.current = Date.now();
        notify('Connection interrupted. Retrying…');
      }
    } finally {
      pollingRef.current = false;
    }
  }, [forget, notify, updateGame]);
  const act = useCallback(async (action, data = {}) => {
    if (!sessionRef.current || busyRef.current) return;
    busyRef.current = true;
    requestVersionRef.current += 1;
    setBusy(true);
    try {
      const result = await callGame(action, sessionRef.current, data);
      if (action === 'leave') {
        forget();
        notify('You left the room.');
      } else {
        if (action === 'guess' || action === 'replay') resetDraft();
        if (action === 'replay') setView('play');
        updateGame(result);
      }
    } catch (error) {
      notify(error.message || 'The game request failed.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [forget, notify, resetDraft, updateGame]);

  useEffect(() => {
    if (!draftIdRef.current) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ id: draftIdRef.current, colors: draft })); } catch { /* Playing does not require persistent storage. */ }
  }, [draft]);
  useEffect(() => {
    const room = new URLSearchParams(location.search).get('room');
    if (room && /^[a-f0-9]{6}$/i.test(room)) {
      setRoomCodeInput(room.toUpperCase());
      setFormTab('join');
    }
    if (sessionRef.current) void refresh();
    const interval = setInterval(() => { if (!document.hidden) void refresh(); }, 1800);
    const tick = setInterval(() => setClock(Date.now()), 250);
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => {
      clearInterval(interval);
      clearInterval(tick);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(''), 3600);
    return () => clearTimeout(timeout);
  }, [toast]);

  async function enter(action) {
    if (busyRef.current) return;
    const name = nickname.trim().slice(0, 20);
    if (!name) return notify('Please enter a nickname.');
    const create = action === 'create';
    const code = roomCodeInput.trim().toUpperCase();
    if (!create && !/^[A-F0-9]{6}$/.test(code)) return notify('Enter your six-character room code.');
    const previous = sessionRef.current;
    const candidate = {
      name, code: create ? '' : code,
      token: !create && previous?.code === code ? previous.token : token(),
    };
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await callGame(action, candidate, { name, ...(create ? { mode } : {}) });
      const next = { ...candidate, code: result.code };
      sessionRef.current = next;
      setSession(next);
      try {
        localStorage.setItem(NAME_KEY, name);
        localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      } catch { notify('Joined. Keep this tab open; your browser cannot save the session.'); }
      resetDraft();
      setView('play');
      updateGame(result);
      history.replaceState(null, '', location.pathname + '?room=' + encodeURIComponent(result.code));
      notify(create ? 'Room created! Invite your friends.' : 'You joined the room!');
    } catch (error) {
      notify(error.message || 'Could not join.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const players = game?.players || [];
  const activePlayers = players.filter((player) => player.active);
  const me = players.find((player) => player.id === game?.me);
  const host = game?.hostId === game?.me;
  const allReady = activePlayers.length >= 2 && activePlayers.every((player) => player.ready);
  const guesses = game?.guesses || [];
  const mine = guesses.filter((guess) => guess.playerId === game?.me);
  const limit = game?.mode === 'rush' ? 8 : 4;
  const attempt = game && ['reveal', 'timed-reveal'].includes(game.mode) ? game.round : mine.length + 1;
  const remainingMs = game?.deadline ? Math.max(0, new Date(game.deadline).getTime() - clock - offsetRef.current) : null;
  const canSubmit = !!game && game.status === 'playing' && !busy &&
    (remainingMs === null || remainingMs > 0) &&
    (game.mode !== 'classic' || game.turnId === game.me) &&
    mine.length < limit &&
    (!['reveal', 'timed-reveal'].includes(game.mode) ||
      !mine.some((guess) => guess.attempt === game.round));
  const visibleGuesses = useMemo(() => guesses.filter((guess) =>
    guess.revealed && (playerFilter === 'all' || guess.playerId === playerFilter)), [guesses, playerFilter]);
  const people = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const guessedThisRound = mine.some((guess) => guess.attempt === game?.round);
  const statusText = !game || game.status === 'lobby' ? 'ROOM LOBBY'
    : game.status === 'finished' ? 'GAME OVER'
    : busy ? 'SENDING YOUR MOVE…'
    : game.mode === 'classic' && game.turnId !== game.me ? 'WAIT YOUR TURN'
    : ['reveal', 'timed-reveal'].includes(game.mode) && guessedThisRound ? 'WAIT FOR THE REVEAL'
    : mine.length >= limit ? 'ALL GUESSES USED'
    : !canSubmit ? 'ROUND ENDING' : 'MAKE YOUR MOVE';

  function addColor(value) {
    if (!canSubmit) return;
    const next = [...draft];
    next[selected] = value;
    const empty = [1, 2, 3, 4].map((step) => (selected + step) % 4).find((index) => next[index] === null);
    setDraft(next);
    setSelected(empty === undefined ? (selected + 1) % 4 : empty);
  }
  function submitGuess() {
    if (!canSubmit || draft.some((value) => value === null)) return;
    void act('guess', { colors: [...draft], puzzle: game.puzzle, attempt });
  }
  async function copyText(text, message) {
    try { await navigator.clipboard.writeText(text); notify(message); }
    catch { window.prompt('Copy:', text); }
  }
  async function share() {
    if (!game) return;
    const link = new URL(location.href);
    link.searchParams.set('room', game.code);
    link.hash = '';
    if (navigator.share) {
      try { await navigator.share({ title: 'Pin & Spin', text: `Join my room: ${game.code}`, url: link.toString() }); }
      catch (error) { if (error.name !== 'AbortError') await copyText(link.toString(), 'Invite link copied!'); }
    } else await copyText(link.toString(), 'Invite link copied!');
  }

  return <>
    <div className="ambient" aria-hidden="true" />
    <div className={'shell' + (game && game.status !== 'lobby' ? ' match-shell' : '')}>
      <header className="topbar">
        <a className="home-link" href={import.meta.env.VITE_PLAYVOLT_HUB_URL || "https://github.com/WorkVolt-tech/PlayVolt"} aria-label="Back to PlayVolt">← <span>PLAYVOLT</span></a>
        <div className="brand">Pin &amp; <span>Spin</span></div>
        <div className="live"><i /><span>{game ? 'ROOM LIVE' : 'PARTY GAME'}</span></div>
      </header>

      <main>
        {!session && <section className="screen entry-screen">
          {formTab === 'home' ? <>
            <div className="hero approved-hero">
              <h1 className="bunny-logo"><img src="/pin-and-spin-logo.webp" alt="Pin & Spin" width="1536" height="1024" fetchPriority="high" /></h1>
              <p className="tagline">Crack the code.<br />Challenge your friends.</p>
              <span className="players-badge">2–10 players</span>
            </div>
            <div className="home-actions">
              <button className="primary-btn" onClick={() => setFormTab('create')}>Create Room <span>＋</span></button>
              <button className="outline-btn full" onClick={() => setFormTab('join')}>Join Room <span>↗</span></button>
              <button className="outline-btn full" onClick={() => setFormTab('help')}>How to Play <span>?</span></button>
            </div>
            <div className="board-legend home-legend"><span><i className="pin-dot" /> Pin: right color + spot</span>
              <span><i className="spin-dot" /> Spin: right color</span></div>
          </> : <>
            <button className="back-button" onClick={() => setFormTab('home')}>← Back</button>
            <h1 className="page-title">{formTab === 'create' ? 'Choose a mode' : formTab === 'join' ? 'Join your friends' : 'How to Play'}</h1>
            {formTab === 'help' ? <div className="howto help-screen">
              <section className="surface"><h2>Four slots. Six colors.</h2><p>Everyone tries to find the same secret sequence of four colors. Colors can repeat. Tap a slot, then pick a color. Fill all four and submit.</p>
                <div className="board-legend"><span><i className="pin-dot" /> Pin: right color + spot</span><span><i className="spin-dot" /> Spin: right color, wrong spot</span></div>
                <p>Each ball counts once. Clue dots count matches; they do not identify specific slots.</p></section>
              {Object.values(MODES).map(config => <section className="surface" key={config.label}><h2>{config.label}</h2><p>{config.description}</p></section>)}
              <section className="surface"><h2>One room. Up to ten friends.</h2><p>Share the room code, mark yourselves ready, and let the host start. Open Everyone’s Guesses to see revealed results without losing your draft. If no one solves the code, the answer is revealed with no winner.</p></section>
            </div> : <form className="room-form" onSubmit={(e) => { e.preventDefault(); void enter(formTab); }}>
              {formTab === 'create' && <div className="mode-grid">
                {Object.entries(MODES).map(([id, config]) => <label key={id} className={'mode-option' + (mode === id ? ' selected' : '')}>
                  <input type="radio" name="mode" value={id} checked={mode === id} onChange={() => setMode(id)} />
                  <Peg value={config.color} tiny />
                  <span className="mode-body"><strong>{config.label}</strong><small>{config.hint}</small></span>
                  <span className="mode-check">✓</span>
                </label>)}
              </div>}
              <label className="field-label" htmlFor="nickname">YOUR NAME</label>
              <input id="nickname" type="text" autoComplete="nickname" maxLength={20} required
                placeholder="What should we call you?" value={nickname} onChange={(e) => setNickname(e.target.value)} />
              {formTab === 'join' && <>
                <label className="field-label" htmlFor="roomCodeInput">ROOM CODE</label>
                <input className="code-input" type="text" id="roomCodeInput" minLength={6} maxLength={6}
                  required spellCheck={false} autoCapitalize="characters" placeholder="A1B2C3" value={roomCodeInput}
                  onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())} />
              </>}
              <button type="submit" className="primary-btn" disabled={busy}>
                {busy ? 'Connecting…' : formTab === 'create' ? 'Create Room' : 'Join Room'}<span>→</span>
              </button>
              <div className="bottom-note">No sign-up needed <span>•</span> 2–10 players</div>
            </form>}
          </>}
        </section>}

        {session && !game && <div className="surface"><p>Reconnecting to your room…</p>
          <button className="outline-btn full" onClick={forget}>BACK TO HOME</button></div>}

        {session && game && <section className="screen">
          {game.status === 'lobby' ? <>
            <h1 className="page-title">Your room</h1>
            <div className="surface lobby-code"><strong>{game.code}</strong><div className="invite-actions">
              <button className="outline-btn" onClick={() => copyText(game.code, 'Room code copied!')}>▣ Copy Code</button>
              <button className="outline-btn" onClick={share}>↗ Invite Friends</button>
            </div></div>
            <div className="surface lobby-mode"><Peg value={MODES[game.mode].color} tiny />
              <div><strong>{MODES[game.mode].label}</strong><p>{MODES[game.mode].hint}</p></div></div>
          </> : <div className="match-room-bar">
            <span className="match-room-code">Room <strong>{game.code}</strong></span>
            <button className="outline-btn small" onClick={share}>Invite ↗</button>
            <span className="match-room-details">{MODES[game.mode]?.label || 'Game'} · {activePlayers.length} players</span>
          </div>}

          {game.status === 'lobby'
            ? <div className="surface">
                <div className="panel-title"><h2>Players</h2><span>{activePlayers.length} / 10 PLAYERS</span></div>
                <div className="player-list">
                  {activePlayers.map((player) => <div className="player-item" key={player.id}>
                    <span className="player-avatar">{(player.name || '?').slice(0,1).toUpperCase()}</span>
                    <div className="player-info"><div className="player-name">{player.name}{player.id === game.me ? ' (YOU)' : ''}</div>
                      <div className="player-description">{player.id === game.hostId ? 'HOST' : 'PLAYER ' + player.seat}</div>
                    </div>
                    <span className={'ready-pill' + (player.ready ? '' : ' wait')}>
                      {player.ready ? '● READY' : '○ WAITING'}
                    </span>
                  </div>)}
                </div>
                <p className="lobby-help">{activePlayers.length < 2
                  ? 'Invite at least one friend with your room code to start.'
                  : allReady ? 'Everybody is ready. Time to crack the code!' : 'Wait for everybody to mark themselves ready.'}</p>
                {!host && <button className="outline-btn full" disabled={busy}
                    onClick={() => void act('ready', { ready: !me?.ready })}>
                    {me?.ready ? 'NOT READY' : "I'M READY"}
                  </button>}
                {host && <button className="primary-btn" disabled={busy || !allReady}
                    onClick={() => void act('start')}>Start Game<span>→</span></button>}
              </div>
            : <>
                <div className="match-meta">
                  <div><span>{game.mode === 'rush' ? 'RUSH MODE' :
                    ['reveal', 'timed-reveal'].includes(game.mode) ? 'ROUND ' + game.round + ' / 4' : 'CLASSIC · 4 TRIES EACH'}</span>
                    <strong>{statusText}</strong>
                  </div>
                  {remainingMs !== null && game.status === 'playing' &&
                    <div className={'timer' + (remainingMs <= 20000 ? ' urgent' : '')}>
                      {String(Math.floor(Math.ceil(remainingMs/1000)/60)).padStart(2,'0')}:
                      {String(Math.ceil(remainingMs/1000)%60).padStart(2,'0')}
                    </div>}
                </div>
                <div className="view-tabs" role="tablist" aria-label="Match views">
                  <button type="button" className={'view-tab' + (view === 'play' ? ' active' : '')}
                    role="tab" aria-selected={view === 'play'} onClick={() => setView('play')}>MY BOARD</button>
                  <button type="button" className={'view-tab' + (view === 'results' ? ' active' : '')}
                    role="tab" aria-selected={view === 'results'} onClick={() => setView('results')}>
                    EVERYONE'S GUESSES</button>
                </div>
                {view === 'play' && <>
                  {game.status === 'finished'
                    ? <div className="surface finish-panel">
                        <span className="trophy">✦</span><p className="eyebrow">MATCH COMPLETE</p>
                        <h2>{(game.winners || []).length
                          ? (game.winners.includes(game.me) ? 'YOU CRACKED IT!' : 'CODE CRACKED!')
                          : 'NO WINNER THIS TIME'}</h2>
                        <p>{(game.winners || []).length
                          ? (game.winners.map((id) => people.get(id)?.name || 'Player').join(' & ') +
                            ((game.winners || []).length > 1 ? ' share the win!' : ' wins the match!'))
                          : 'Nobody solved the combination this time.'}</p>
                        <p className="field-label">SECRET COMBINATION</p>
                        <PegRow colors={game.answer} />
                        {host && <button className="primary-btn" disabled={busy}
                          onClick={() => void act('replay')}>PLAY AGAIN<span>→</span></button>}
                        <button className="outline-btn full" onClick={() => setView('results')}>
                          VIEW EVERYONE'S GUESSES
                        </button>
                      </div>
                    : <div className="surface guess-panel">
                        <div className="panel-title"><h2>YOUR GUESS</h2><span>TRY {Math.min(attempt, limit)} / {limit}</span></div>
                        <p className="field-help">{canSubmit
                          ? 'Tap colors to fill your slots. Repeats are allowed.'
                          : 'View the other players while waiting for your next move.'}</p>
                        <CodeBoard mine={mine} limit={limit} attempt={attempt} canSubmit={canSubmit}
                          draft={draft} selected={selected} onSelect={setSelected} />
                        <div className="board-legend"><span><i className="pin-dot" /> Pin: right spot</span>
                          <span><i className="spin-dot" /> Spin: right color</span></div>
                        <p className="field-help">Dots count matches; they do not point to particular slots.</p>
                        <p className="field-label colors-label">PICK A COLOR</p>
                        <div className="color-palette">
                          {COLORS.map((color, index) => <button type="button"
                            className="color-choice" style={{ '--color': color.hex }}
                            key={color.name} aria-label={'Choose '+color.name} disabled={!canSubmit}
                            onClick={() => addColor(index)}>
                            <Peg value={index} tiny /><small>{color.name}</small>
                          </button>)}
                        </div>
                        <div className="guess-actions">
                          <button className="outline-btn" type="button" disabled={!canSubmit || draft.every((v) => v === null)}
                            onClick={resetDraft}>CLEAR</button>
                          <button className="primary-btn" type="button"
                            disabled={!canSubmit || draft.some((v) => v === null)} onClick={submitGuess}>
                            SUBMIT GUESS <span>→</span></button>
                        </div>
                      </div>}
                  {game.status === 'finished' && <div className="surface history-panel">
                    <div className="panel-title"><h2>MY GUESSES</h2><span>{mine.length} SUBMITTED</span></div>
                    <CodeBoard mine={mine} limit={limit} attempt={attempt} canSubmit={false}
                      draft={draft} selected={selected} onSelect={setSelected} />
                  </div>}
                </>}
                {view === 'results' && <div className="surface results-panel">
                  <div className="panel-title"><h2>THE SCOREBOARD</h2><span>{visibleGuesses.length} REVEALED</span></div>
                  <p className="field-help">Public guesses appear here. In Reveal modes, guesses stay private until their round is revealed.</p>
                  <label className="field-label" htmlFor="playerFilter">SHOW GUESSES FOR</label>
                  <select id="playerFilter" className="player-filter" value={playerFilter}
                    onChange={(event) => setPlayerFilter(event.target.value)}>
                    <option value="all">All players</option>
                    {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                  </select>
                  {visibleGuesses.length === 0
                    ? <Empty>Nothing has been revealed yet. Everyone's public results will appear here.</Empty>
                    : [...new Set(visibleGuesses.map((guess) => guess.attempt))]
                        .sort((a,b) => b-a)
                        .map((round) => <div className="round-group" key={round}>
                          <h3>ROUND / TRY {round}</h3>
                          <div className="guess-list">
                            {visibleGuesses.filter((guess) => guess.attempt === round).map((guess) =>
                              <GuessRow guess={guess} key={guess.playerId + '-' + guess.attempt}
                                label={people.get(guess.playerId)?.name || 'Player'} />)}
                          </div>
                        </div>)}
                  {game.status === 'finished' && Array.isArray(game.answer) &&
                    <div className="surface finish-panel">
                      <p className="field-label">FINAL SECRET COMBINATION</p>
                      <PegRow colors={game.answer} />
                      {host && <button className="primary-btn" disabled={busy}
                        onClick={() => void act('replay')}>PLAY AGAIN<span>→</span></button>}
                    </div>}
                </div>}
              </>}
          <button className="leave-link" type="button" disabled={busy}
            onClick={() => { if (window.confirm('Leave this room?')) void act('leave'); }}>
            ← Leave room
          </button>
        </section>}
      </main>
      <footer className="footer">PIN &amp; SPIN <span>·</span> A PLAYVOLT GAME</footer>
    </div>
    <div className={'toast' + (toast ? ' show' : '')} role="status" aria-live="polite">{toast}</div>
  </>;
}
