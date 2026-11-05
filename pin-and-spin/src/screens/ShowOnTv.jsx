import React, { useState } from 'react';
import { tvPairAddress, tvUrl } from '../tv/tvLink.js';
import { play } from '../sound/sfx.js';
import { TvSetupGuide } from '../components/TvSetupGuide.jsx';

// Letters that can appear in a TV code (no look-alikes such as 0/O or 1/I).
const clean = (value) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);

// Connect a TV: type the 4-letter code the TV shows at <site>/tv. The long link stays
// available for laptops or for opening on a computer plugged into the TV.
export function ShowOnTv({ game, pairTv, onClose }) {
  const link = tvUrl(game.code, game.displayToken);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState({ busy: false, done: false, error: '' });
  const [showLink, setShowLink] = useState(!pairTv);
  const [guide, setGuide] = useState(false);

  async function copy() {
    play('select-item');
    try { await navigator.clipboard.writeText(link); setCopied(true); }
    catch { window.prompt('Copy this TV link:', link); }
  }
  async function connect(event) {
    event.preventDefault();
    if (code.length !== 4 || status.busy) return;
    setStatus({ busy: true, done: false, error: '' });
    try {
      await pairTv(code);
      play('confirm-unlock');
      setStatus({ busy: false, done: true, error: '' });
      setCode('');
    } catch (error) {
      play('invalid-thunk');
      setStatus({ busy: false, done: false, error: error.message || 'Could not connect the TV.' });
    }
  }

  return <div className="sheet-backdrop" onClick={onClose}>
    <div className="sheet surface tv-sheet" role="dialog" aria-modal="true" aria-label="Show on TV" onClick={(e) => e.stopPropagation()}>
      <div className="panel-title"><h2>📺 Show on TV</h2><button type="button" className="sheet-close" onClick={onClose} aria-label="Close">✕</button></div>

      {pairTv && <form className="tv-pair-form" onSubmit={connect}>
        <p className="field-help">On the TV’s web browser (Fire TV, Samsung, LG, a laptop…), go to
          <strong className="tv-pair-address"> {tvPairAddress()}</strong> and type the 4-letter code it shows:</p>
        <div className="tv-pair-input">
          <input value={code} onChange={(e) => { setCode(clean(e.target.value)); setStatus((s) => ({ ...s, done: false, error: '' })); }}
            inputMode="text" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false}
            placeholder="ABCD" aria-label="TV code" />
          <button type="submit" className="primary-btn" disabled={code.length !== 4 || status.busy}>
            {status.busy ? 'Connecting…' : 'Connect TV'}</button>
        </div>
        {status.done && <p className="tv-pair-ok" role="status">✓ TV connected! It now shows this room.</p>}
        {status.error && <p className="tv-pair-error" role="alert">{status.error}</p>}
        <p className="field-help small">Tip: bookmark that page on the TV. Several TVs can show the same room.</p>
      </form>}

      <button type="button" className="text-btn tv-link-toggle" aria-expanded={guide} onClick={() => setGuide(!guide)}>
        {guide ? 'Hide TV setup steps' : 'First time? How to set up your TV (Fire TV app & more)'}</button>
      {guide && <TvSetupGuide />}

      {pairTv && !showLink && <button type="button" className="text-btn tv-link-toggle" onClick={() => setShowLink(true)}>
        Use a link instead (laptop or computer)</button>}
      {showLink && <>
        <p className="field-help">Or open this link in a browser on a laptop or a computer connected to a TV.
          Hidden guesses and the secret never appear on the TV before the reveal.</p>
        <div className="tv-link-box">{link}</div>
        <div className="tv-sheet-actions">
          <button type="button" className="primary-btn" onClick={copy}>{copied ? 'Link copied!' : 'Copy TV link'}<span>⧉</span></button>
          <a className="outline-btn tv-open" href={link} target="_blank" rel="noopener">Open here</a>
        </div>
      </>}
      <p className="field-help small">On the TV, press “Start sound &amp; full screen” once.</p>
    </div>
  </div>;
}
