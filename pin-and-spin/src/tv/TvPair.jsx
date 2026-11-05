import React, { useEffect, useRef, useState } from 'react';
import { callGame } from '../game/api.js';
import { token as newToken } from '../game/session.js';
import { QrCode } from './QrCode.jsx';

const TV_KEY = 'pin_and_spin_tv_v1';
const CHECK_MS = 1500;

// This TV's own random token: only this screen can collect the room link for its code.
function tvToken() {
  try {
    const saved = localStorage.getItem(TV_KEY);
    if (/^[a-f0-9]{64}$/.test(saved || '')) return saved;
    const fresh = newToken();
    localStorage.setItem(TV_KEY, fresh);
    return fresh;
  } catch { return newToken(); }
}

// The short TV address (/tv): shows a 4-letter code. A player types it on their phone in
// "Show on TV", and this screen switches to that room's live board. Nothing long to type.
export function TvPair({ onPaired }) {
  const [token] = useState(tvToken);
  const [pair, setPair] = useState(null);
  const [problem, setProblem] = useState('');
  const [now, setNow] = useState(Date.now());
  const offsetRef = useRef(0);

  useEffect(() => {
    let stopped = false, timer = null, current = null;
    const later = (fn, ms) => { if (!stopped) timer = setTimeout(fn, ms); };
    async function start() {
      try {
        const next = await callGame('tv_start', { token });
        if (stopped) return;
        offsetRef.current = new Date(next.serverTime || Date.now()).getTime() - Date.now();
        current = next;
        setPair(next);
        setProblem('');
        later(check, CHECK_MS);
      } catch (e) {
        if (stopped) return;
        setProblem(/too many/i.test(e.message || '') ? e.message : 'Can’t reach Pin & Spin. Check the TV’s internet connection. Retrying…');
        later(start, 5000);
      }
    }
    async function check() {
      if (new Date(current.expiresAt).getTime() <= Date.now() + offsetRef.current) return start();
      try {
        const result = await callGame('tv_check', { token }, { pairCode: current.pairCode });
        if (stopped) return;
        setProblem('');
        if (result.paired) return onPaired({ code: result.code, token: result.displayToken });
        later(check, CHECK_MS);
      } catch (e) {
        if (stopped) return;
        if (/expired|not found/i.test(e.message || '')) return start();
        later(check, 4000); // Network hiccup: keep the code on screen and try again.
      }
    }
    void start();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { stopped = true; clearTimeout(timer); clearInterval(tick); };
  }, [token, onPaired]);

  const left = pair ? Math.max(0, new Date(pair.expiresAt).getTime() - (now + offsetRef.current)) : 0;
  const mins = Math.floor(left / 60000), secs = String(Math.floor(left / 1000) % 60).padStart(2, '0');

  return <div className="tv-pair">
    <section className="tv-pair-main">
      <p className="tv-kicker">Connect this TV</p>
      <div className="tv-pair-code" aria-live="polite" aria-label={pair ? `TV code ${pair.pairCode.split('').join(' ')}` : 'Getting a code'}>
        {(pair?.pairCode || '····').split('').map((ch, i) => <span key={i}>{ch}</span>)}
      </div>
      {pair && <p className="tv-pair-timer">New code in {mins}:{secs}</p>}
      {problem && <p className="tv-pair-problem" role="alert">{problem}</p>}
    </section>
    <section className="tv-pair-steps">
      <ol>
        <li><strong>On your phone</strong>, open Pin &amp; Spin and create or join a room.</li>
        <li>Tap <strong>📺 Show on TV</strong>.</li>
        <li>Type the code above. This TV shows your room right away.</li>
      </ol>
      <div className="tv-pair-scan">
        <QrCode text={`${location.origin}/`} label="QR code to open Pin & Spin on a phone" />
        <span>No room yet? Scan to open<br /><strong>{location.host}</strong></span>
      </div>
    </section>
  </div>;
}
