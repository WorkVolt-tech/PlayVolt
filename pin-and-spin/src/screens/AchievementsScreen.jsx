import React, { useEffect, useState } from 'react';
import { callGame } from '../game/api.js';
import { ACHIEVEMENTS } from '../achievements.js';
import { play } from '../sound/sfx.js';

// Badges earned by the signed-in player (and the ones still to earn).
export function AchievementsScreen({ account, onBack, onSignIn }) {
  const [earned, setEarned] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!account.signedIn) return;
    callGame('achievements', {}, {}).then((r) => {
      setEarned(r.earned);
      try { localStorage.setItem(`pin_and_spin_badges_${account.user.id}`, JSON.stringify(Object.keys(r.earned))); } catch { /* optional */ }
    }).catch((e) => setError(e.message || 'Could not load achievements.'));
  }, [account.signedIn, account.user?.id]);

  const groups = [...new Set(ACHIEVEMENTS.map((a) => a.group))];
  const count = earned ? ACHIEVEMENTS.filter((a) => earned[a.code]).length : 0;
  return <section className="screen achievements-screen">
    <button className="back-button" onClick={() => { play('tap-ui-tick'); onBack(); }}>← Back</button>
    <h1 className="page-title">🏅 Achievements</h1>
    {!account.signedIn && <div className="surface lb-note"><p>Earn badges by winning matches, keeping your daily streak and
      finishing story worlds. Sign in to start collecting.</p>
      <button type="button" className="primary-btn" onClick={onSignIn}>Sign in / Create account <span>→</span></button></div>}
    {error && <div className="surface lb-empty"><p>{error}</p></div>}
    {account.signedIn && !earned && !error && <div className="surface lb-empty"><p>Loading…</p></div>}
    {earned && <>
      <p className="story-total">{count} / {ACHIEVEMENTS.length} unlocked</p>
      <div className="badge-progress" aria-hidden="true"><i style={{ width: `${(count / ACHIEVEMENTS.length) * 100}%` }} /></div>
      {groups.map((group) => <section key={group} className="surface badge-group">
        <h2>{group}</h2>
        <div className="badge-grid">
          {ACHIEVEMENTS.filter((a) => a.group === group).map((a) => {
            const when = earned[a.code];
            return <div key={a.code} className={'badge' + (when ? ' earned' : '')}>
              <span className="badge-icon" aria-hidden="true">{when ? a.icon : '🔒'}</span>
              <strong>{a.title}</strong>
              <small>{a.text}</small>
              {when && <em>{new Date(when).toLocaleDateString()}</em>}
            </div>;
          })}
        </div>
      </section>)}
    </>}
  </section>;
}
