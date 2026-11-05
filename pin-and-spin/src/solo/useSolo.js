// State and server calls for the 1-player modes. All rules run on the server; the phone
// only sends guesses and shows what comes back (the code is revealed when a game ends).
import { useCallback, useEffect, useRef, useState } from 'react';
import { EMPTY_GUESS } from '../game/constants.js';
import { callGame } from '../game/api.js';
import { placeColor } from '../game/selectors.js';
import { play } from '../sound/sfx.js';
import { localDay } from './solo.js';
import { checkAchievements } from '../achievements.js';

const call = (action, data) => callGame(action, {}, data);

export function useSolo(notify, userId) {
  const [home, setHome] = useState(null);
  const [game, setGame] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(EMPTY_GUESS);
  const [selected, setSelected] = useState(0);
  const [flash, setFlash] = useState(null); // beat the clock: last code solved/skipped
  const [clock, setClock] = useState(Date.now());
  const offsetRef = useRef(0);
  const gameRef = useRef(null);

  const resetDraft = useCallback(() => { setDraft([...EMPTY_GUESS]); setSelected(0); }, []);
  const show = useCallback((next) => {
    offsetRef.current = new Date(next.serverTime || Date.now()).getTime() - Date.now();
    const old = gameRef.current;
    gameRef.current = next;
    // A game just ended: announce any badge it earned.
    if (old?.id === next.id && old.status === 'playing' && next.status !== 'playing') void checkAchievements(userId, notify);
    setGame(next);
  }, [userId, notify]);

  const loadHome = useCallback(async () => {
    setError('');
    try { setHome(await call('solo_home', { day: localDay() })); }
    catch (e) { setError(e.message || 'Could not load solo games.'); }
  }, []);

  async function start(kind, level = 'normal', fresh = false) {
    if (busy) return;
    setBusy(true);
    try {
      show(await call('solo_start', { kind, level, fresh, day: localDay() }));
      resetDraft(); setFlash(null);
      play('drawer-open');
    } catch (e) { play('invalid-thunk'); notify(e.message || 'Could not start the game.'); }
    finally { setBusy(false); }
  }

  // Story mode: play a level (resumes an unfinished try unless fresh).
  async function startStory(level, fresh = false) {
    if (busy) return;
    setBusy(true);
    try {
      show(await call('story_start', { level, fresh }));
      resetDraft(); setFlash(null);
      play('drawer-open');
    } catch (e) { play('invalid-thunk'); notify(e.message || 'Could not start the level.'); }
    finally { setBusy(false); }
  }

  async function submit() {
    if (busy || !game || draft.some((v) => v === null)) return;
    setBusy(true);
    play('message-sent-swish');
    try {
      const next = await call('solo_guess', { id: game.id, colors: draft, attempt: game.guesses.length + 1 });
      show(next); resetDraft();
      if (next.kind === 'clock' && next.lastResult) {
        setFlash({ result: next.lastResult, code: next.lastSecret, at: Date.now() });
        play(next.lastResult === 'solved' ? 'xp-up' : 'error-soft-thud');
      } else if (next.status === 'won') play('level-up');
      else if (next.status === 'lost') play('modal-close-fall');
      else play('pop-bubble');
    } catch (e) { play('invalid-thunk'); notify(e.message || 'That guess did not go through. Try again.'); }
    finally { setBusy(false); }
  }

  function pick(value) {
    play('tap-ui-tick');
    const next = placeColor(draft, selected, value);
    setDraft(next.draft); setSelected(next.selected);
  }
  function clear() { play('swipe'); resetDraft(); }
  function leave() { gameRef.current = null; setGame(null); setFlash(null); resetDraft(); void loadHome(); }

  // Beat the clock: tick, and ask the server for the final result when time is up.
  const deadline = game?.status === 'playing' ? game.deadline : null;
  useEffect(() => {
    if (!deadline) return undefined;
    const tick = setInterval(() => setClock(Date.now()), 250);
    const wait = new Date(deadline).getTime() - (Date.now() + offsetRef.current) + 300;
    const end = setTimeout(async () => {
      try { const next = await call('solo_get', { id: game.id }); show(next); play(next.kind === 'clock' ? 'achievement' : 'modal-close-fall'); } catch { /* retried by the next action */ }
    }, Math.max(0, wait));
    return () => { clearInterval(tick); clearTimeout(end); };
  }, [deadline, game?.id, show]);
  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(t);
  }, [flash]);

  const remainingMs = deadline ? Math.max(0, new Date(deadline).getTime() - (clock + offsetRef.current)) : null;
  return { home, game, busy, error, draft, selected, flash, remainingMs, loadHome, start, startStory, submit, pick, clear, leave, setSelected };
}
