import React from 'react';
import { COLORS, EMPTY_GUESS } from '../game/constants.js';
import { Peg } from './Peg.jsx';
import { Feedback } from './Feedback.jsx';

// The player's own stacked guess rows; the current row's slots are tappable.
// peek (admins only): the secret, shown faintly in the empty slots.
export function CodeBoard({ mine, limit, attempt, canSubmit, draft, selected, onSelect, peek }) {
  const empty = draft?.length === 5 ? [null, null, null, null, null] : EMPTY_GUESS;
  return <div className={'code-board' + (empty.length === 5 ? ' slots-5' : '')} aria-label="Your guess board">
    {Array.from({ length: limit }, (_, i) => {
      const guess = mine.find((g) => g.attempt === i + 1);
      const active = canSubmit && attempt === i + 1;
      const colors = !guess && attempt === i + 1 ? draft : guess?.colors || empty;
      const ghost = peek && !guess;
      return <div className={'code-row' + (active ? ' current' : '') + (guess ? ' played' : '') + (ghost ? ' peek-row' : '')} key={i}>
        <span className="attempt-number">{i + 1}</span>
        <div className="code-slots">
          {colors.map((value, index) => active
            ? <button type="button" key={index} className={'code-slot' + (selected === index ? ' selected' : '')}
                aria-label={`Slot ${index + 1}: ${value === null ? 'empty' : COLORS[value].name}`}
                aria-pressed={selected === index} onClick={() => onSelect(index)}>
                {value === null && ghost ? <span className="peek-ghost"><Peg value={peek[index]} tiny /></span> : <Peg key={value ?? 'empty'} value={value} tiny />}
              </button>
            : value === null && ghost ? <span className="peek-ghost" key={index}><Peg value={peek[index]} tiny /></span>
            : <Peg key={index} value={value} tiny />)}
        </div>
        <Feedback guess={guess} slots={empty.length} />
      </div>;
    })}
  </div>;
}
