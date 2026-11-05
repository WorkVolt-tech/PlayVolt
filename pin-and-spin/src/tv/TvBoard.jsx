import React, { useLayoutEffect, useRef, useState } from 'react';
import { MODES } from '../game/constants.js';
import { Confetti } from '../components/Confetti.jsx';
import { Feedback } from '../components/Feedback.jsx';
import { Peg, PegRow } from '../components/Peg.jsx';
import { PlayerAvatar } from '../components/PlayerAvatar.jsx';
import { formatClock, guessLimit, inTurnOrder, isSimultaneous, ordinal, playerProgress } from '../game/selectors.js';
import { tvGrid } from './tvGrid.js';


// The live board on the TV. Public data only (revealed guesses, locked-in flags, winners,
// and the secret once the match is over). Every player gets a lane with one row per try.
export function TvBoard({ game, remainingMs }) {
  const lanes = inTurnOrder(game, playerProgress(game)).filter((lane) => lane.guesses.length || lane.sealed || !lane.left);
  const limit = guessLimit(game.mode);
  const simultaneous = isSimultaneous(game.mode);
  const playing = game.status === 'playing';
  const active = lanes.filter((lane) => !lane.left);
  const locked = active.filter((lane) => lane.player.submitted).length;
  const { cols, rows } = tvGrid(lanes.length);
  // Classic: who plays after the current player (skipping anyone with no tries left).
  const turnAt = active.findIndex((lane) => lane.isTurn);
  const upNext = turnAt < 0 ? null : [...active.slice(turnAt + 1), ...active.slice(0, turnAt)].find((lane) => lane.used < limit)?.player.id;
  const hasTimer = playing && remainingMs !== null && remainingMs !== undefined;
  const [minutes, seconds] = hasTimer ? formatClock(remainingMs) : [];

  // Size the balls from the space each lane really gets on this screen.
  const gridRef = useRef(null);
  const [ball, setBall] = useState(40);
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return undefined;
    const measure = () => {
      const { width, height } = grid.getBoundingClientRect();
      const gap = Math.max(8, window.innerWidth * 0.008);
      const laneW = (width - gap * (cols - 1)) / cols;
      const laneH = (height - gap * (rows - 1)) / rows;
      // Lane = header (~1.25 balls) + one row per try (~1.32 balls each) + padding.
      const byHeight = (laneH - laneW * 0.04) / (1.6 + limit * 1.36);
      const byWidth = laneW / 8.4;
      setBall(Math.max(10, Math.floor(Math.min(byHeight, byWidth, window.innerHeight * 0.065))));
    };
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(grid);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [cols, rows, limit]);

  const players = game.players || [];
  const winners = (game.winners || []).map((id) => players.find((p) => p.id === id)).filter(Boolean);

  return <div className="tvb">
    <div className="tvb-status">
      <span className={'status-pill' + (playing ? '' : ' done')}>
        {!playing ? 'FINAL RESULTS' : simultaneous ? `ROUND ${game.round} / 4` : `${MODES[game.mode]?.label.toUpperCase()} · LIVE`}
      </span>
      <span className="tvb-mode">{MODES[game.mode]?.label}</span>
      {playing && simultaneous && <span className="tvb-note">{locked} of {active.length} locked in</span>}
      {game.mode === 'classic' && <span className="tvb-note">Turn order: 1 → {active.length}</span>}
      <span className="tvb-legend"><span><i className="pin-dot" /> Pin</span><span><i className="spin-dot" /> Spin</span></span>
      {hasTimer && <span className={'tvb-timer' + (remainingMs <= 20000 ? ' urgent' : '')}>{minutes}:{seconds}</span>}
    </div>

    {game.status === 'finished' && <div className={'tvb-result' + (winners.length ? ' has-winner' : '')}>
      {winners.length > 0 && <Confetti />}
      <span className="tvb-trophy" aria-hidden="true">{winners.length ? '🏆' : '✦'}</span>
      <div className="tvb-result-text">
        <strong>{winners.length ? 'CODE CRACKED!' : 'NO WINNER THIS TIME'}</strong>
        {winners.length > 0
          ? <span className="tvb-winners">{winners.map((p) => <span className="winner-chip" key={p.id}><PlayerAvatar player={p} size="sm" />{p.name}</span>)}
              {winners.length > 1 ? ' share the win!' : ' wins!'}</span>
          : <span className="tvb-winners">Nobody solved the combination.</span>}
      </div>
      <div className="tvb-secret">
        <small>SECRET</small>
        <div>{(game.answer || []).map((value, i) => <span className="secret-ball" key={i} style={{ '--i': i }}><Peg value={value} tiny /></span>)}</div>
      </div>
    </div>}

    <div className="tvb-grid" ref={gridRef}
      style={{ '--cols': cols, '--rows': rows, '--tries': limit, '--tvb': `${ball}px` }}>
      {lanes.map((lane) => {
        const status = lane.won ? 'WINNER' : lane.left ? 'LEFT' : lane.away ? 'AWAY' : lane.isTurn ? 'PLAYING NOW' : lane.player.id === upNext ? 'UP NEXT'
          : lane.thinking ? 'THINKING…' : lane.sealed ? 'LOCKED IN' : `${lane.used} / ${limit}`;
        const tries = Array.from({ length: limit }, (_, i) => lane.guesses.find((g) => g.attempt === i + 1) || null);
        const sealedAt = !lane.sealed ? -1 : simultaneous ? game.round - 1 : lane.guesses.length;
        return <section key={lane.player.id}
          className={'tvb-lane' + (lane.won ? ' won' : '') + (lane.isTurn ? ' turn' : '') + (lane.player.id === upNext ? ' next' : '') + (lane.left ? ' left' : '') + (lane.away ? ' away' : '')}>
          <header>
            {lane.order && <span className="turn-no" title={`Plays ${ordinal(lane.order)}`}>{lane.order}</span>}
            <PlayerAvatar player={lane.player} />
            <strong>{lane.player.name}</strong>
            <small>{status}</small>
          </header>
          <ol>
            {tries.map((guess, i) => <li key={i} className={guess ? 'played' : i === sealedAt ? 'sealed' : 'open'} style={{ '--i': i }}>
              <span className="tvb-try">{i + 1}</span>
              {guess?.colors ? <PegRow colors={guess.colors} tiny />
                : guess ? <span className="tvb-missed">No guess in time</span>
                : i === sealedAt ? <span className="sealed-balls" role="img" aria-label="Guess sealed until the reveal">{[0, 1, 2, 3].map((k) => <i key={k} />)}</span>
                : <span className="tvb-empty">{[0, 1, 2, 3].map((k) => <i key={k} />)}</span>}
              {guess?.colors ? <Feedback guess={guess} /> : <span className="tvb-fb-space" />}
            </li>)}
          </ol>
        </section>;
      })}
    </div>
  </div>;
}
