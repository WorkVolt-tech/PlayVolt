import React from 'react';
import { COLORS } from '../game/constants.js';

// A color ball. Each color also carries a glyph/pattern so it reads without color vision.
export function Peg({ value, tiny = false }) {
  const color = value == null ? null : COLORS[Number(value)];
  if (!color) return <span className={tiny ? 'tiny-peg empty-peg' : 'slot'} aria-label="Empty slot">·</span>;
  return tiny
    ? <span className={`tiny-peg patterned-peg color-${value}`} title={color.name} aria-label={color.name}
        style={{ '--color': color.hex }}><span className="peg-glyph" aria-hidden="true">{color.glyph}</span></span>
    : <span className={`slot filled patterned-peg color-${value}`} title={color.name} aria-label={color.name} style={{ '--slot-color': color.hex, '--color': color.hex }}>
        <span className="peg-glyph" aria-hidden="true">{color.glyph}</span>
      </span>;
}

export function PegRow({ colors, tiny = false }) {
  return <div className={tiny ? 'tiny-pegs' : 'slots answer-slots'}>
    {(colors || []).map((value, index) => <Peg key={index} value={value} tiny={tiny} />)}
  </div>;
}
