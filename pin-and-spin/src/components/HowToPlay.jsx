import React, { useEffect, useState } from 'react';
import { MODES } from '../game/constants.js';
import { Peg, PegRow } from './Peg.jsx';
import { Feedback } from './Feedback.jsx';
import { TvSetupGuide } from './TvSetupGuide.jsx';
import { play } from '../sound/sfx.js';

// The ⓘ button: game rules, modes, and how to set up a TV.
export function HowToPlayButton() {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="info-btn" aria-label="How to play" title="How to play"
      onClick={() => { play('drawer-open'); setOpen(true); }}>i</button>
    {open && <HowToPlay onClose={() => { play('drawer-close'); setOpen(false); }} />}
  </>;
}

export function HowToPlay({ onClose, initialTab = 'rules' }) {
  const [tab, setTab] = useState(initialTab);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div className="sheet-backdrop" onClick={onClose}>
    <div className="sheet surface help-sheet" role="dialog" aria-modal="true" aria-label="How to play" onClick={(e) => e.stopPropagation()}>
      <div className="panel-title"><h2>How to play</h2>
        <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">✕</button></div>
      <div className="help-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'rules'} className={tab === 'rules' ? 'on' : ''} onClick={() => setTab('rules')}>Rules</button>
        <button type="button" role="tab" aria-selected={tab === 'modes'} className={tab === 'modes' ? 'on' : ''} onClick={() => setTab('modes')}>Game modes</button>
        <button type="button" role="tab" aria-selected={tab === 'tv'} className={tab === 'tv' ? 'on' : ''} onClick={() => setTab('tv')}>Play on a TV</button>
      </div>
      <div className="help-body">
        {tab === 'rules' && <Rules />}
        {tab === 'modes' && <Modes />}
        {tab === 'tv' && <TvSetupGuide />}
      </div>
    </div>
  </div>;
}

function Rules() {
  return <div className="guide">
    <section>
      <h3>🎯 The goal</h3>
      <p>A secret code of <b>4 balls</b> is hidden. Crack it before everyone else, with as few guesses as you can.</p>
      <div className="guide-colors">{[0, 1, 2, 3, 4, 5].map((c) => <Peg key={c} value={c} tiny />)}</div>
      <p className="guide-note">6 colors. A color can appear more than once (e.g. two reds).</p>
    </section>
    <section>
      <h3>🟢 Pin and ⚪ Spin</h3>
      <p>After each guess you get clues:</p>
      <ul>
        <li><i className="pin-dot guide-dot" /> <b>Pin</b> = right color in the <b>right spot</b>.</li>
        <li><i className="spin-dot guide-dot" /> <b>Spin</b> = right color, but in the <b>wrong spot</b>.</li>
        <li>No dot = that color isn’t in the code (or not that many of it).</li>
      </ul>
      <p className="guide-note">The dots don’t tell you <b>which</b> balls they mean. That’s the puzzle!</p>
    </section>
    <section>
      <h3>🔍 Example</h3>
      <div className="guide-example">
        <span>Secret</span><PegRow colors={[1, 0, 1, 4]} tiny /><span />
        <span>Guess</span><PegRow colors={[1, 1, 2, 0]} tiny /><Feedback guess={{ revealed: true, colors: [1, 1, 2, 0], pins: 1, spins: 2 }} />
      </div>
      <p className="guide-note">1 Pin (the red in spot 1) and 2 Spins (the second red and the blue are in the code, but in other spots).</p>
    </section>
    <section>
      <h3>🏆 Winning</h3>
      <p>The first player to get <b>4 Pins</b> wins. If nobody cracks it, the secret is shown at the end.
        In the modes where everyone guesses together, players who solve in the same reveal share the win.</p>
    </section>
    <section>
      <h3>🕹️ Playing</h3>
      <ol>
        <li>One player creates a room and shares the 6-character code. Everyone joins on their phone (2–10 players; Classic is a 2-player duel).</li>
        <li>Tap colors to fill the 4 spots (tap a spot to change it), then <b>Submit guess</b>.</li>
        <li>Watch everyone’s guesses on the mini boards, or tap them for the full board. Put it on a TV with <b>📺 Show on TV</b>.</li>
      </ol>
    </section>
  </div>;
}

function Modes() {
  return <div className="guide">
    {Object.entries(MODES).map(([id, mode]) => <section key={id} className="guide-mode">
      <h3><Peg value={mode.color} tiny /> {mode.label} <span className="guide-tag">{mode.hint}</span></h3>
      <p>{mode.description}</p>
      {id === 'classic' && <p className="guide-note">The number next to each player shows the turn order (1 plays first).</p>}
    </section>)}
  </div>;
}
