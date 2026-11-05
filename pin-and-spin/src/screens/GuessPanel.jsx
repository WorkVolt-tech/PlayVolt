import React from 'react';
import { COLORS } from '../game/constants.js';
import { CodeBoard } from '../components/CodeBoard.jsx';
import { Peg } from '../components/Peg.jsx';

// The phone controller: stacked guess rows, color palette, Clear and Submit.
export function GuessPanel({ mine, limit, attempt, canSubmit, draft, selected, onSelect, onColor, onClear, onSubmit }) {
  return <div className="surface guess-panel">
    <div className="panel-title"><h2>YOUR GUESS</h2><span>TRY {Math.min(attempt, limit)} / {limit}</span></div>
    <p className="field-help">{canSubmit
      ? 'Tap colors to fill your slots. Repeats are allowed.'
      : 'View the other players while waiting for your next move.'}</p>
    <CodeBoard mine={mine} limit={limit} attempt={attempt} canSubmit={canSubmit}
      draft={draft} selected={selected} onSelect={onSelect} />
    <div className="board-legend"><span><i className="pin-dot" /> Pin: right spot</span>
      <span><i className="spin-dot" /> Spin: right color</span></div>
    <p className="field-help">Dots count matches; they do not point to particular slots.</p>
    <p className="field-label colors-label">PICK A COLOR</p>
    <div className="color-palette">
      {COLORS.map((color, index) => <button type="button"
        className="color-choice" style={{ '--color': color.hex }}
        key={color.name} aria-label={'Choose '+color.name} disabled={!canSubmit}
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
  </div>;
}
