import React, { useEffect, useState } from 'react';
import { canPromptInstall, isIos, onInstallChange, promptInstall } from '../pwa.js';

// The TV's QR codes open this mobile handoff only in the browser. Installed PWAs
// receive the same room URL and go straight to the normal Join Room screen.
export function QrJoinScreen() {
  const params = new URLSearchParams(location.search);
  const requested = (params.get('room') || '').toUpperCase();
  const room = /^[A-F0-9]{6}$/.test(requested) ? requested : '';
  const joinLink = room ? `/?room=${encodeURIComponent(room)}` : '/';
  const [installReady, setInstallReady] = useState(canPromptInstall);
  const [installStarted, setInstallStarted] = useState(false);
  useEffect(() => onInstallChange(() => setInstallReady(canPromptInstall())), []);

  async function install() {
    const accepted = await promptInstall();
    if (accepted) setInstallStarted(true);
  }

  return <div className="qr-entry shell">
    <header className="topbar">
      <a className="home-link" href={joinLink}>← PIN &amp; SPIN</a>
      <div className="brand">Pin &amp; <span>Spin</span></div>
    </header>
    <main className="qr-entry-main">
      <section className="surface qr-entry-card">
        <div className="qr-entry-icon" aria-hidden="true">📲</div>
        <p className="eyebrow">PLAYVOLT · PHONE GAME</p>
        <h1>{room ? 'Join your friends' : 'Play Pin & Spin'}</h1>
        {room && <div className="qr-entry-room">
          <span>YOUR ROOM CODE</span><strong>{room}</strong>
        </div>}
        <p className="qr-entry-intro">Play from your phone with the Pin &amp; Spin app. No App Store download needed.</p>
        {installReady && <button className="primary-btn qr-entry-button" type="button" onClick={() => void install()}>
          📲 Install Pin &amp; Spin <span>↓</span>
        </button>}
        {!installReady && isIos() && <p className="qr-entry-help">
          <strong>Install on iPhone:</strong> In Safari, tap <b>Share</b> (⬆️), then <b>Add to Home Screen</b>.
        </p>}
        {!installReady && !isIos() && <p className="qr-entry-help">
          <strong>Install on Android:</strong> Open this page in Chrome, then tap its <b>⋮</b> menu and choose <b>Install app</b> or <b>Add to Home screen</b>.
        </p>}
        {installStarted && <p className="qr-entry-help" role="status">Installation started. Open Pin &amp; Spin from your Home Screen when it appears.</p>}
        <div className="qr-entry-existing">
          <strong>Already have Pin &amp; Spin installed?</strong>
          <p>Open the saved app from your Home Screen{room ? ', tap Join Room and enter the code above.' : '.'} On supported Android phones, scanning the QR code can open the installed app directly.</p>
        </div>
        <a className="outline-btn qr-entry-browser" href={joinLink}>
          {room ? 'Join this room in the browser' : 'Continue in the browser'}
        </a>
      </section>
    </main>
    <footer className="footer">PIN &amp; SPIN <span>·</span> A PLAYVOLT GAME</footer>
  </div>;
}
