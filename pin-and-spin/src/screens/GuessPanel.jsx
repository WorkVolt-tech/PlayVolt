import React from 'react';
import { COLORS } from '../game/constants.js';
import { CodeBoard } from '../components/CodeBoard.jsx';
import { Peg } from '../components/Peg.jsx';

// The phone controller: stacked guess rows, color palette, Clear and Submit.
// colorCount / help: optional, for solo games (easy mode uses 4 colors with no repeats).
export function GuessPanel({ mine, limit, attempt, canSubmit, draft, selected, onSelect, onColor, onClear, onSubmit, colorCount = 6, help }) {
  return <div className="surface guess-panel">
    <div className="panel-title"><h2>YOUR GUESS</h2>
      <span className="board-legend inline"><span><i className="pin-dot" /> Pin</span><span><i className="spin-dot" /> Spin</span></span>
      <span>TRY {Math.min(attempt, limit)} / {limit}</span></div>
    {/* Only level-specific hints (solo/story); the general rules live under ⓘ. */}
    {help && <p className="field-help">{help}</p>}
    <CodeBoard mine={mine} limit={limit} attempt={attempt} canSubmit={canSubmit}
      draft={draft} selected={selected} onSelect={onSelect} />
    {/* Pinned to the bottom of the screen, so colors and Submit are always in reach. */}
    <div className="guess-dock">
      <div className={'color-palette' + (colorCount === 4 || colorCount >= 7 ? ' four' : '')}>
        {COLORS.slice(0, colorCount).map((color, index) => <button type="button"
          className="color-choice" style={{ '--color': color.hex }}
          key={color.name} aria-label={'Choose ' + color.name} disabled={!canSubmit}
          onClick={() => onColor(index)}>
          <Peg value={index} tiny /><small>{color.name}</small>
        </button>)}
      </div>
      <div className="guess-actions">
        <button className="outline-btn" type="button" disabled={!canSubmit || draft.every((v) => v === null)}
          onClick={onClear}>CLEAR</button>
        <button className="primary-btn" type="button"
          disabled={!canSubmit || draft.some((v) => v === null)} onClick={onSubmit}>
          SUBMIT GUESS <span>→</span></button>
      </div>
    </div>
  </div>;
}
