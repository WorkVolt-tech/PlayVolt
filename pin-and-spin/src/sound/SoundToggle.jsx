import React, { useEffect, useState } from 'react';
import { isMuted, onMuteChange, play, setMuted } from './sfx.js';

// Header button: sound on/off, remembered on this device.
export function SoundToggle() {
  const [muted, setState] = useState(isMuted);
  useEffect(() => onMuteChange(setState), []);
  return <button type="button" className="sound-toggle" aria-pressed={!muted}
    aria-label={muted ? 'Sound off. Turn sound on' : 'Sound on. Turn sound off'}
    onClick={() => { const next = !muted; setMuted(next); if (!next) play('toggle-switch-on'); }}>
    <span aria-hidden="true">{muted ? '🔇' : '🔊'}</span>
  </button>;
}
