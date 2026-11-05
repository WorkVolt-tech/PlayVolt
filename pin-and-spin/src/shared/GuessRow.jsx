import React from 'react';
import { EMPTY_GUESS } from '../game/constants.js';
import { PegRow } from '../components/Peg.jsx';
import { Feedback } from '../components/Feedback.jsx';

export function GuessRow({ guess, label }) {
  return <div className="guess-item">
    <div className="guess-id"><b>{label}</b><small>TRY {guess.attempt}</small></div>
    <PegRow colors={guess.colors || EMPTY_GUESS} tiny />
    <div className="score"><Feedback guess={guess} /></div>
  </div>;
}
