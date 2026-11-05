import React, { useState } from 'react';
import { tvUrl } from '../tv/tvLink.js';
import { play } from '../sound/sfx.js';

// Sheet with the room's TV link: open it on a laptop or smart-TV browser.
export function ShowOnTv({ game, onClose }) {
  const link = tvUrl(game.code, game.displayToken);
  const [copied, setCopied] = useState(false);
  async function copy() {
    play('select-item');
    try { await navigator.clipboard.writeText(link); setCopied(true); }
    catch { window.prompt('Copy this TV link:', link); }
  }
  return <div className="sheet-backdrop" onClick={onClose}>
    <div className="sheet surface tv-sheet" role="dialog" aria-modal="true" aria-label="Show on TV" onClick={(e) => e.stopPropagation()}>
      <div className="panel-title"><h2>📺 Show on TV</h2><button type="button" className="sheet-close" onClick={onClose} aria-label="Close">✕</button></div>
      <p className="field-help">Open this link in a browser on a laptop, smart TV or a computer connected to a TV.
        It shows the room code, the players and the live board. Hidden guesses and the secret never appear there before the reveal.</p>
      <div className="tv-link-box">{link}</div>
      <div className="tv-sheet-actions">
        <button type="button" className="primary-btn" onClick={copy}>{copied ? 'Link copied!' : 'Copy TV link'}<span>⧉</span></button>
        <a className="outline-btn tv-open" href={link} target="_blank" rel="noopener">Open here</a>
      </div>
      <p className="field-help small">Tip: on the TV, press “Start sound &amp; full screen” once.</p>
    </div>
  </div>;
}
