import React, { useCallback, useEffect, useRef, useState } from 'react';
import { EMPTY_GUESS } from '../game/constants.js';
import { Feedback } from '../components/Feedback.jsx';
import { PegRow } from '../components/Peg.jsx';
import { PlayerAvatar } from '../components/PlayerAvatar.jsx';
import { guessLimit, inTurnOrder, playerProgress } from '../game/selectors.js';

// A mini view of everyone's guesses: one small card per player with their public
// guess rows (balls + Pin/Spin dots) and empty rows for tries not yet used.
// Public data only, so it is safe for the shared display too.
export function MiniBoards({ game, onOpen }) {
  const limit = guessLimit(game.mode);
  const lanes = inTurnOrder(game, playerProgress(game)).filter((lane) => !lane.left || lane.guesses.length);
  // On a phone the boards slide sideways: fade the edge that has more players, and slide to
  // whoever's turn it is. (On wide screens they wrap into rows and nothing is hidden.)
  const boxRef = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const box = boxRef.current;
    if (!box) return;
    const left = box.scrollLeft > 4, right = box.scrollLeft + box.clientWidth < box.scrollWidth - 4;
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
  }, []);
  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure, lanes.length]);
  const turnId = game.status === 'playing' ? game.turnId : null;
  useEffect(() => {
    const box = boxRef.current;
    const card = turnId && box?.querySelector('.mini-card.turn');
    if (!card || box.scrollWidth <= box.clientWidth) return;
    const start = card.offsetLeft - box.offsetLeft, end = start + card.offsetWidth;
    if (start < box.scrollLeft || end > box.scrollLeft + box.clientWidth) {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      box.scrollTo({ left: Math.max(0, start - 8), behavior: reduce ? 'auto' : 'smooth' });
    }
  }, [turnId]);
  const hidden = edges.left || edges.right;
  return <>
  <div ref={boxRef} onScroll={measure} aria-label="Everyone's guesses, mini view"
    className={'mini-boards' + (edges.left ? ' more-left' : '') + (edges.right ? ' more-right' : '')}>
    {lanes.map((lane) => {
      const state = lane.won ? 'won' : lane.left ? 'left' : lane.away ? 'away' : lane.isTurn ? 'turn' : lane.sealed ? 'in' : lane.thinking ? 'thinking' : '';
      const label = { won: '🏆', left: 'LEFT', away: 'AWAY', turn: 'TURN', in: '✓', thinking: '…' }[state] || '';
      const rows = [...lane.guesses];
      const total = Math.max(limit, rows.length + (lane.sealed ? 1 : 0));
      return <button type="button" key={lane.player.id} onClick={() => onOpen?.(lane.player.id)}
        className={'mini-card ' + state + (lane.player.id === game.me ? ' me' : '')}
        aria-label={`${lane.player.name}: ${lane.used} of ${limit} tries${label ? ', ' + state : ''}. Open Everyone's Guesses`}>
        <span className="mini-head">
          {lane.order && <span className="turn-no" title={`Plays ${lane.order === 1 ? 'first' : `#${lane.order}`}`}>{lane.order}</span>}
          <PlayerAvatar player={lane.player} size="xs" />
          <span className="mini-name">{lane.player.id === game.me ? 'You' : lane.player.name}</span>
          {label && <span className="mini-state">{label}</span>}
        </span>
        <span className="mini-rows">
          {Array.from({ length: total }, (_, i) => {
            const guess = rows[i];
            if (guess) return <span className="mini-row" key={i}>
              {guess.colors ? <PegRow colors={guess.colors} tiny /> : <span className="mini-missed">missed</span>}
              {guess.colors ? <Feedback guess={guess} /> : <span className="mini-gap" />}
            </span>;
            if (i === rows.length && lane.sealed) return <span className="mini-row sealed" key={i}>
              <span className="sealed-balls">{[0, 1, 2, 3].map((n) => <i key={n} />)}</span><span className="mini-gap" />
            </span>;
            return <span className="mini-row empty" key={i}><PegRow colors={EMPTY_GUESS} tiny /><span className="mini-gap" /></span>;
          })}
        </span>
      </button>;
    })}
  </div>
  {hidden && <p className="mini-hint" aria-hidden="true">{edges.left ? '‹ ' : ''}Swipe to see all {lanes.length} players{edges.right ? ' ›' : ''}</p>}
  </>;
}
