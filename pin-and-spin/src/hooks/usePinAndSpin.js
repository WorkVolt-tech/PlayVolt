// Room session, polling and server actions for one player device (the "controller").
// A future shared display would use its own read-only hook against the display token.
import { useCallback, useEffect, useRef, useState } from 'react';
import { DRAFT_KEY, EMPTY_GUESS, NAME_KEY, SESSION_KEY } from '../game/constants.js';
import { callGame } from '../game/api.js';
import { savedName, savedSession, token } from '../game/session.js';
import { isValidDraft, nextAttempt } from '../game/selectors.js';

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
    const draftId = `${next.code}:${next.puzzle}:${nextAttempt(next)}`;
    if (draftIdRef.current !== draftId) {
      draftIdRef.current = draftId;
      let saved;
      try { saved = JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch { /* Optional draft recovery. */ }
      if (saved?.id === draftId && isValidDraft(saved.colors)) {
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

  return {
    session, game, busy, toast, notify, clock, offset: offsetRef.current,
    form: { formTab, setFormTab, nickname, setNickname, roomCodeInput, setRoomCodeInput, mode, setMode, enter },
    view, setView,
    draft, setDraft, selected, setSelected, resetDraft,
    act, forget,
  };
}
