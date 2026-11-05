import React from 'react';
import { COLORS, EMPTY_GUESS } from '../game/constants.js';
import { Peg } from './Peg.jsx';
import { Feedback } from './Feedback.jsx';

// The player's own stacked guess rows; the current row's slots are tappable.
export function CodeBoard({ mine, limit, attempt, canSubmit, draft, selected, onSelect }) {
  const empty = draft?.length === 5 ? [null, null, null, null, null] : EMPTY_GUESS;
  return <div className={'code-board' + (empty.length === 5 ? ' slots-5' : '')} aria-label="Your guess board">
    {Array.from({ length: limit }, (_, i) => {
      const guess = mine.find((g) => g.attempt === i + 1);
      const active = canSubmit && attempt === i + 1;
      const colors = !guess && attempt === i + 1 ? draft : guess?.colors || empty;
      return <div className={'code-row' + (active ? ' current' : '') + (guess ? ' played' : '')} key={i}>
        <span className="attempt-number">{i + 1}</span>
        <div className="code-slots">
          {colors.map((value, index) => active
            ? <button type="button" key={index} className={'code-slot' + (selected === index ? ' selected' : '')}
                aria-label={`Slot ${index + 1}: ${value === null ? 'empty' : COLORS[value].name}`}
                aria-pressed={selected === index} onClick={() => onSelect(index)}>
                <Peg key={value ?? 'empty'} value={value} tiny />
              </button>
            : <Peg key={index} value={value} tiny />)}
        </div>
        <Feedback guess={guess} slots={empty.length} />
      </div>;
    })}
  </div>;
}
