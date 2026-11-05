import React, { useEffect, useState } from 'react';
import { canPromptInstall, isInstalled, isIos, onInstallChange, promptInstall } from '../pwa.js';
import { play } from '../sound/sfx.js';

// Home screen card: install Pin & Spin as an app (no App Store needed), like Dekabess.
export function InstallApp() {
  const [, refresh] = useState(0);
  useEffect(() => onInstallChange(() => refresh((n) => n + 1)), []);
  if (isInstalled()) return null;
  if (canPromptInstall()) return <div className="install-card surface">
    <span className="install-icon" aria-hidden="true">📲</span>
    <div><strong>Install Pin &amp; Spin</strong><p>Play it like an app from your home screen. Free, no store needed.</p></div>
    <button type="button" className="primary-btn install-btn" onClick={() => { play('click-crisp-primary'); void promptInstall(); }}>Install</button>
  </div>;
  if (isIos()) return <div className="install-card surface">
    <span className="install-icon" aria-hidden="true">📲</span>
    <div><strong>Install as an app</strong><p>Tap <b>Share</b> <span aria-hidden="true">⬆️</span> then <b>Add to Home Screen</b> to play
      Pin &amp; Spin like a native app. No App Store needed.</p></div>
  </div>;
  return null;
}
