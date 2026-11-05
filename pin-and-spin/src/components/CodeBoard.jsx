import React from 'react';
import { COLORS, EMPTY_GUESS } from '../game/constants.js';
import { Peg } from './Peg.jsx';
import { Feedback } from './Feedback.jsx';

// The player's own stacked guess rows; the current row's slots are tappable.
export function CodeBoard({ mine, limit, attempt, canSubmit, draft, selected, onSelect }) {
  return <div className="code-board" aria-label="Your guess board">
    {Array.from({ length: limit }, (_, i) => {
      const guess = mine.find((g) => g.attempt === i + 1);
      const active = canSubmit && attempt === i + 1;
      const colors = !guess && attempt === i + 1 ? draft : guess?.colors || EMPTY_GUESS;
      return <div className={'code-row' + (active ? ' current' : '')} key={i}>
        <span className="attempt-number">{i + 1}</span>
        <div className="code-slots">
          {colors.map((value, index) => active
            ? <button type="button" key={index} className={'code-slot' + (selected === index ? ' selected' : '')}
                aria-label={`Slot ${index + 1}: ${value === null ? 'empty' : COLORS[value].name}`}
                aria-pressed={selected === index} onClick={() => onSelect(index)}>
                <Peg value={value} tiny />
              </button>
            : <Peg key={index} value={value} tiny />)}
        </div>
        <Feedback guess={guess} />
      </div>;
    })}
  </div>;
}
