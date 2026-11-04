import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const API = 'https://eybzbtyfafmqbkulyvog.supabase.co/functions/v1/pin-and-spin';
const SESSION_KEY = 'pin_and_spin_session_v1';
const NAME_KEY = 'pin_and_spin_nickname';
const COLORS = [
  { name: 'Red', hex: '#ff5579', glyph: '●' },
  { name: 'Blue', hex: '#52adff', glyph: '◆' },
  { name: 'Green', hex: '#62e5a0', glyph: '▲' },
  { name: 'Yellow', hex: '#ffdc55', glyph: '✦' },
  { name: 'Purple', hex: '#b987ff', glyph: '⬟' },
  { name: 'Orange', hex: '#ff995a', glyph: '■' },
];
const MODES = {
  classic: { label: 'CLASSIC', icon: '↪', hint: 'Take turns · 4 tries each' },
  reveal: { label: 'REVEAL', icon: '◉', hint: 'All guess · Reveal together' },
  'timed-reveal': { label: 'TIMED REVEAL', icon: '◷', hint: '3 min per round · 4 rounds' },
  rush: { label: 'RUSH', icon: 'ϟ', hint: '3 min total · 8 tries each' },
};
const EMPTY_GUESS = [null, null, null, null];

function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('');
}
function savedSession() {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
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
  const color = COLORS[Number(value)];
  if (!color) return <span className={tiny ? 'tiny-peg' : 'slot'}>?</span>;
  return tiny
    ? <span className="tiny-peg" title={color.name} aria-label={color.name}
        style={{ '--color': color.hex }}>{color.glyph}</span>
    : <span className="slot filled" title={color.name} style={{ '--slot-color': color.hex }}>
        <span className="slot-shape">{color.glyph}</span>
      </span>;
}
function PegRow({ colors, tiny = false }) {
  return <div className={tiny ? 'tiny-pegs' : 'slots answer-slots'}>
    {(colors || []).map((value, index) => <Peg key={index} value={value} tiny={tiny} />)}
  </div>;
}
function GuessRow({ guess, label }) {
  return <div className="guess-item">
    <div className="guess-id"><b>{label}</b><small>TRY {guess.attempt}</small></div>
    <PegRow colors={guess.colors} tiny />
    <div className="score">
      {guess.revealed
        ? <><span className="pin">{guess.pins} PIN</span><span className="spin">{guess.spins} SPIN</span></>
        : <span className="pending">SEALED</span>}
    </div>
  </div>;
}

export default function App() {
  const [session, setSession] = useState(savedSession);
  const [game, setGame] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formTab, setFormTab] = useState('create');
  const [nickname, setNickname] = useState(savedName);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [mode, setMode] = useState('classic');
  const [view, setView] = useState('play');
  const [draft, setDraft] = useState(EMPTY_GUESS);
  const [selected, setSelected] = useState(0);
  const [toast, setToast] = useState('');
  const [clock, setClock] = useState(Date.now());
  const sessionRef = useRef(session);
  const gameRef = useRef(game);
  const busyRef = useRef(false);
  const pollingRef = useRef(false);
  const offsetRef = useRef(0);
  const lastWarningRef = useRef(0);

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
    if (old && (old.puzzle !== next.puzzle ||
      (old.round !== next.round && next.mode !== 'classic'))) resetDraft();
    if (old?.status === 'lobby' && next.status === 'playing') setView('play');
    setGame(next);
    setClock(Date.now());
  }, [resetDraft]);
  const forget = useCallback(() => {
    sessionRef.current = null;
    gameRef.current = null;
    setSession(null);
    setGame(null);
    setView('play');
    resetDraft();
    localStorage.removeItem(SESSION_KEY);
    history.replaceState(null, '', location.pathname);
  }, [resetDraft]);
  const refresh = useCallback(async () => {
    if (!sessionRef.current || busyRef.current || pollingRef.current) return;
    pollingRef.current = true;
    try {
      const next = await callGame('state', sessionRef.current);
      if (!busyRef.current) updateGame(next);
    } catch (error) {
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
      localStorage.setItem(NAME_KEY, name);
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
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
    guess.revealed && Array.isArray(guess.colors)), [guesses]);
  const people = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const guessedThisRound = mine.some((guess) => guess.attempt === game?.round);
  const statusText = !game || game.status === 'lobby' ? 'ROOM LOBBY'
    : game.status === 'finished' ? 'GAME OVER'
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
  async function share() {
    if (!game) return;
    const link = new URL(location.href);
    link.searchParams.set('room', game.code);
    try {
      await navigator.clipboard.writeText(link.toString());
      notify('Invite link copied!');
    } catch {
      window.prompt('Copy your invite link:', link.toString());
    }
  }

  return <>
    <div className="ambient" aria-hidden="true" />
    <div className="shell">
      <header className="topbar">
        <a className="home-link" href={import.meta.env.VITE_PLAYVOLT_HUB_URL || "https://github.com/WorkVolt-tech/PlayVolt"} aria-label="Back to PlayVolt">← <span>PLAYVOLT</span></a>
        <div className="brand">PIN <span>&amp;</span> SPIN</div>
        <div className="live"><i /><span>{game ? 'ROOM LIVE' : 'PARTY GAME'}</span></div>
      </header>

      <main>
        {!session && <section className="screen">
          <div className="hero">
            <div className="eyebrow"><span className="spark">✦</span> CODE BREAKING, REIMAGINED</div>
            <h1>CRACK THE <em>CODE.</em><br />OWN THE <em>ROOM.</em></h1>
            <p>Four slots. Six colors. One secret. Challenge your friends to solve it first.</p>
            <div className="hero-pegs" aria-hidden="true">
              {[[0,'●'],[1,'◆'],[3,'✦'],[4,'⬟']].map(([index,glyph])=>
                <span className={'peg ' + ['red','blue','yellow','purple'][[0,1,3,4].indexOf(index)]} key={index}>{glyph}</span>)}
            </div>
          </div>
          <div className="surface start-panel">
            <div className="tabbar" role="tablist" aria-label="Room action">
              <button className={'tab' + (formTab === 'create' ? ' active' : '')}
                type="button" role="tab" aria-selected={formTab === 'create'}
                onClick={() => setFormTab('create')}>CREATE ROOM</button>
              <button className={'tab' + (formTab === 'join' ? ' active' : '')}
                type="button" role="tab" aria-selected={formTab === 'join'}
                onClick={() => setFormTab('join')}>JOIN ROOM</button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); void enter(formTab); }}>
              <label className="field-label" htmlFor="nickname">YOUR NICKNAME</label>
              <input id="nickname" type="text" autoComplete="nickname" maxLength={20} required
                placeholder="What should we call you?" value={nickname}
                onChange={(e) => setNickname(e.target.value)} />
              {formTab === 'create'
                ? <>
                    <p className="field-label mode-title">CHOOSE YOUR GAME</p>
                    <div className="mode-grid">
                      {Object.entries(MODES).map(([id, config]) =>
                        <label key={id} className={'mode-option' + (mode === id ? ' selected' : '')}>
                          <input type="radio" name="mode" value={id} checked={mode === id}
                            onChange={() => setMode(id)} />
                          <span className="mode-icon">{config.icon}</span>
                          <span className="mode-body"><strong>{config.label}</strong><small>{config.hint}</small></span>
                          <span className="mode-check">✓</span>
                        </label>)}
                    </div>
                  </>
                : <>
                    <label className="field-label" htmlFor="roomCodeInput">6-CHARACTER ROOM CODE</label>
                    <input className="code-input" type="text" id="roomCodeInput" minLength={6}
                      maxLength={6} required spellCheck={false} autoCapitalize="characters"
                      placeholder="A1B2C3" value={roomCodeInput}
                      onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())} />
                  </>}
              <button type="submit" className="primary-btn" disabled={busy}>
                {busy ? 'CONNECTING…' : formTab === 'create' ? 'CREATE GAME' : 'JOIN THE GAME'}<span>→</span>
              </button>
            </form>
            <div className="bottom-note">No sign-up needed <span>•</span> 2–10 players <span>•</span> Play on your phone</div>
          </div>
          <div className="howto">
            <div className="section-heading"><strong>HOW TO PLAY</strong><span>01 / THE BASICS</span></div>
            <div className="howto-row"><div className="howto-number">01</div>
              <div><strong>Pick 4 colors</strong><p>Choose from six colors. Repeats are allowed.</p></div></div>
            <div className="howto-row"><div className="howto-number">02</div>
              <div><strong>Read your clues</strong><p><b className="pin-text">● PIN</b> means right color, right spot. <b className="spin-text">● SPIN</b> means right color, wrong spot.</p></div></div>
            <div className="howto-row"><div className="howto-number">03</div>
              <div><strong>Solve it first</strong><p>Use the clues to break the hidden combination before your friends.</p></div></div>
          </div>
        </section>}

        {session && !game && <div className="surface"><p>Reconnecting to your room…</p>
          <button className="outline-btn full" onClick={forget}>BACK TO HOME</button></div>}

        {session && game && <section className="screen">
          <div className="room-header">
            <div><p className="eyebrow">YOUR GAME ROOM</p><h1>{game.code}</h1>
              <p className="room-mode">{MODES[game.mode]?.label || 'GAME'} · {activePlayers.length} PLAYERS</p></div>
            <button className="outline-btn small" onClick={share}>SHARE ↗</button>
          </div>

          {game.status === 'lobby'
            ? <div className="surface">
                <div className="panel-title"><h2>THE LINEUP</h2><span>{activePlayers.length} / 10 PLAYERS</span></div>
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
                    onClick={() => void act('start')}>START MATCH<span>→</span></button>}
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
                        <div className="slots" role="group" aria-label="Your four-color guess">
                          {draft.map((value, index) => {
                            const color = value == null ? null : COLORS[value];
                            return <button type="button" key={index} disabled={!canSubmit}
                              aria-label={'Slot '+(index+1)+(color ? ': '+color.name : ': empty')}
                              className={'slot' + (color ? ' filled' : '') +
                                (selected === index && canSubmit ? ' selected' : '')}
                              style={color ? { '--slot-color': color.hex } : {}}
                              onClick={() => setSelected(index)}>
                              <span className="slot-number">{index+1}</span>
                              {color ? <span className="slot-shape">{color.glyph}</span> : '+'}
                            </button>;
                          })}
                        </div>
                        <p className="field-label colors-label">PICK A COLOR</p>
                        <div className="color-palette">
                          {COLORS.map((color, index) => <button type="button"
                            className="color-choice" style={{ '--color': color.hex }}
                            key={color.name} aria-label={'Choose '+color.name} disabled={!canSubmit}
                            onClick={() => addColor(index)}>
                            <span>{color.glyph}</span><small>{color.name}</small>
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
                  <div className="surface history-panel">
                    <div className="panel-title"><h2>MY GUESSES</h2><span>{mine.length} SUBMITTED</span></div>
                    <div className="guess-list">{mine.length
                      ? [...mine].reverse().map((guess) => <GuessRow guess={guess} key={guess.attempt}
                          label={'#' + guess.attempt} />)
                      : <Empty>Your guesses will appear here as you play.</Empty>}</div>
                  </div>
                </>}
                {view === 'results' && <div className="surface results-panel">
                  <div className="panel-title"><h2>THE SCOREBOARD</h2><span>{visibleGuesses.length} REVEALED</span></div>
                  <p className="field-help">Public guesses appear here. In Reveal modes, guesses stay private until their round is revealed.</p>
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
