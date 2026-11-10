// Room session, polling and server actions for one player device (the "controller").
// A future shared display would use its own read-only hook against the display token.
import { useCallback, useEffect, useRef, useState } from 'react';
import { DRAFT_KEY, EMPTY_GUESS, NAME_KEY, SESSION_KEY } from '../game/constants.js';
import { callGame } from '../game/api.js';
import { savedName, savedSession, token } from '../game/session.js';
import { codeSlots, isValidDraft, nextAttempt } from '../game/selectors.js';
import { getSupabase } from '../game/auth.js';
import { play } from '../sound/sfx.js';

// Backup polling: fast when the live signal is unavailable, slow while it is connected.
// Polling also serves as the presence heartbeat (AWAY after 45 seconds of silence).
const POLL_MS = 1800;
const LIVE_POLL_MS = 6000;

export function usePinAndSpin() {
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
  const sessionRef = useRef(session);
  const gameRef = useRef(game);
  const busyRef = useRef(false);
  const pollingRef = useRef(false);
  const againRef = useRef(false);
  const liveRef = useRef(false);
  const lastRefreshRef = useRef(0);
  const offsetRef = useRef(0);
  const lastWarningRef = useRef(0);
  const requestVersionRef = useRef(0);
  const draftIdRef = useRef('');

  const notify = useCallback((message) => setToast(message), []);
  const resetDraft = useCallback(() => {
    setDraft(Array.from({ length: codeSlots(gameRef.current) }, () => null)); // 4, 5 or 6 balls
    setSelected(0);
  }, []);
  const updateGame = useCallback((next) => {
    if (!next?.code) return;
    const old = gameRef.current;
    gameRef.current = next;
    offsetRef.current = new Date(next.serverTime || Date.now()).getTime() - Date.now();
    const draftId = `${next.code}:${next.puzzle}:${nextAttempt(next)}`;
    if (draftIdRef.current !== draftId) {
      draftIdRef.current = draftId;
      let saved;
      try { saved = JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch { /* Optional draft recovery. */ }
      if (saved?.id === draftId && isValidDraft(saved.colors, codeSlots(next))) {
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
    if (!sessionRef.current || busyRef.current) return;
    // A signal that arrives mid-request must not be lost: run once more afterwards.
    if (pollingRef.current) { againRef.current = true; return; }
    pollingRef.current = true;
    lastRefreshRef.current = Date.now();
    const version = requestVersionRef.current;
    const currentSession = sessionRef.current;
    try {
      const next = await callGame('state', currentSession);
      if (!busyRef.current && version === requestVersionRef.current && currentSession === sessionRef.current) updateGame(next);
    } catch (error) {
      if (version !== requestVersionRef.current || currentSession !== sessionRef.current) return;
      // Dropped because the app came back from the background: just ask again, quietly.
      if (error.resumed) { againRef.current = true; return; }
      if (error.accountRequired) {
        if (Date.now() - lastWarningRef.current > 20000) {
          lastWarningRef.current = Date.now();
          notify(error.message);
        }
      } else if (/removed you/i.test(error.message || '')) {
        forget();
        notify('The host removed you from the room.');
      } else if (/not found|expired|no longer in this room/i.test(error.message || '')) {
        forget();
        notify('That room is no longer available.');
      } else if (Date.now() - lastWarningRef.current > 20000) {
        lastWarningRef.current = Date.now();
        notify('Connection interrupted. Retrying…');
      }
    } finally {
      pollingRef.current = false;
      if (againRef.current) { againRef.current = false; void refresh(); }
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
      play('invalid-thunk');
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
    const interval = setInterval(() => {
      if (document.hidden) return;
      if (liveRef.current && Date.now() - lastRefreshRef.current < LIVE_POLL_MS) return;
      void refresh();
    }, POLL_MS);
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

  // Instant updates: the server broadcasts a content-free "changed" signal for this room.
  const roomCode = game?.code;
  useEffect(() => {
    if (!roomCode) return undefined;
    let cancelled = false, supabase = null, channel = null;
    getSupabase().then((client) => {
      if (cancelled) return;
      supabase = client;
      channel = client.channel(`pin-and-spin:${roomCode}`)
        .on('broadcast', { event: 'changed' }, () => { if (!document.hidden) void refresh(); })
        .subscribe((status) => { liveRef.current = status === 'SUBSCRIBED'; });
    }).catch(() => { /* Live signal unavailable: polling continues. */ });
    return () => {
      cancelled = true;
      liveRef.current = false;
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [roomCode, refresh]);

  // Ask the server right when a round or match timer runs out, so the reveal is immediate.
  const deadline = game?.status === 'playing' ? game?.deadline : null;
  useEffect(() => {
    if (!deadline) return undefined;
    const wait = new Date(deadline).getTime() - (Date.now() + offsetRef.current) + 400;
    if (wait > 2147483647) return undefined;
    const timeout = setTimeout(() => void refresh(), Math.max(0, wait));
    return () => clearTimeout(timeout);
  }, [deadline, refresh]);

  // Connect a TV that shows a 4-letter code (TV pairing). Resolves or throws a friendly error.
  const pairTv = useCallback((pairCode) => {
    if (!sessionRef.current) return Promise.reject(new Error('Join a room first.'));
    return callGame('tv_pair', sessionRef.current, { pairCode });
  }, []);

  // accountName: a signed-in player's PlayVolt nickname (the server uses the profile name).
  // codeOverride: join a specific room right away (e.g. from a friend's invite).
  // modeOverride: create a room in this mode (e.g. challenging a friend).
  // Returns the room code on success (so a challenge can invite the friend).
  async function enter(action, accountName, codeOverride, modeOverride) {
    if (busyRef.current) return;
    const name = (accountName || nickname).trim().slice(0, 20);
    if (!name) return notify('Please enter a nickname.');
    const create = action === 'create';
    const code = (codeOverride || roomCodeInput).trim().toUpperCase();
    if (codeOverride) setRoomCodeInput(code);
    if (!create && !/^[A-F0-9]{6}$/.test(code)) return notify('Enter your six-character room code.');
    const previous = sessionRef.current;
    const candidate = {
      name, code: create ? '' : code,
      token: !create && previous?.code === code ? previous.token : token(),
    };
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await callGame(action, candidate, { name, ...(create ? { mode: modeOverride || mode } : {}) });
      const next = { ...candidate, code: result.code };
      sessionRef.current = next;
      setSession(next);
      try {
        if (!accountName) localStorage.setItem(NAME_KEY, name);
        localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      } catch { notify('Joined. Keep this tab open; your browser cannot save the session.'); }
      resetDraft();
      setView('play');
      updateGame(result);
      history.replaceState(null, '', location.pathname + '?room=' + encodeURIComponent(result.code));
      notify(create ? 'Room created! Invite your friends.' : 'You joined the room!');
      return result.code;
    } catch (error) {
      play('invalid-thunk');
      notify(error.message || 'Could not join.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return {
    session, game, busy, toast, notify, clock, offset: offsetRef.current,
    form: { formTab, setFormTab, nickname, setNickname, roomCodeInput, setRoomCodeInput, mode, setMode, enter },
    view, setView,
    draft, setDraft, selected, setSelected, resetDraft,
    act, forget, pairTv,
  };
}
