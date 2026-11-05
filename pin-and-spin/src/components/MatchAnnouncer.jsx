import React, { useEffect, useRef, useState } from 'react';
import { MODES } from '../game/constants.js';
import { matchEvents } from '../game/selectors.js';

// Short vibration patterns (ignored by browsers without vibration support, e.g. iPhone).
const BUZZ = { start: [40], round: [25, 40, 25], turn: [60], scored: [30], solved: [60, 40, 60], win: [80, 50, 80, 50, 140], end: [50] };
const buzz = (pattern) => { try { navigator.vibrate?.(pattern); } catch { /* not supported */ } };

// Watches the match and shows a brief banner ("Round 2", "Your turn!") with a buzz.
export function MatchAnnouncer({ game }) {
  const prevRef = useRef(null);
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    const events = matchEvents(prevRef.current, game);
    prevRef.current = game;
    if (!events.length) return;
    const has = (type) => events.find((e) => e.type === type);
    const end = has('end'), scored = has('scored'), round = has('round');
    if (end) buzz(end.won ? BUZZ.win : BUZZ.end);
    else if (scored?.pins === 4) buzz(BUZZ.solved);
    else if (round) buzz(BUZZ.round);
    else if (has('turn')) buzz(BUZZ.turn);
    else if (scored) buzz(BUZZ.scored);
    else if (has('start')) buzz(BUZZ.start);

    const mode = MODES[game.mode];
    if (has('start')) {
      setBanner({ key: Date.now(), title: 'Game on!', sub: game.mode === 'classic'
        ? (game.turnId === game.me ? 'You go first' : 'Watch for your turn')
        : game.mode === 'rush' ? 'Three minutes on the clock' : `Round 1 of 4 · ${mode.label}` });
    } else if (round) {
      setBanner({ key: Date.now(), title: `Round ${round.round}`, sub: `Round ${round.round - 1} revealed · make your next guess` });
    } else if (has('turn')) {
      setBanner({ key: Date.now(), title: 'Your turn!', sub: 'Pick four colors and submit' });
    }
  }, [game]);

  useEffect(() => {
    if (!banner) return undefined;
    const timeout = setTimeout(() => setBanner(null), 2200);
    return () => clearTimeout(timeout);
  }, [banner]);

  if (!banner) return null;
  return <div className="announce" key={banner.key} role="status" aria-live="polite">
    <strong>{banner.title}</strong><span>{banner.sub}</span>
  </div>;
}
