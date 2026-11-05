import React, { useCallback, useEffect, useRef, useState } from 'react';

// Same update banner as Dekabess: compare this build's version with the deployed
// /version.json and ask the player to refresh when a newer version is live.
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
const CHECK_EVERY_MS = 60 * 1000;

export function VersionAlert() {
  const [latestVersion, setLatestVersion] = useState(null);
  const [updating, setUpdating] = useState(false);
  const lastCheckRef = useRef(0);

  const checkVersion = useCallback(async ({ force = false } = {}) => {
    const now = Date.now();
    if (!force && now - lastCheckRef.current < CHECK_EVERY_MS) return;
    lastCheckRef.current = now;
    try {
      const res = await fetch(`/version.json?t=${now}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.version && data.version !== APP_VERSION) setLatestVersion(data.version);
    } catch {
      // Offline or temporarily unreachable: never interrupt the game.
    }
  }, []);

  useEffect(() => {
    if (APP_VERSION === 'dev') return undefined;
    void checkVersion({ force: true });
    const interval = window.setInterval(() => void checkVersion(), CHECK_EVERY_MS);
    const onFocus = () => void checkVersion({ force: true });
    const onVisible = () => { if (document.visibilityState === 'visible') void checkVersion({ force: true }); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [checkVersion]);

  function updateNow() {
    if (updating) return;
    setUpdating(true);
    // The room session and any unsubmitted colors are saved, so the game resumes after the reload.
    window.setTimeout(() => window.location.reload(), 350);
  }

  if (!latestVersion) return null;
  return <div className="version-alert" role="alert" aria-live="assertive">
    <div className="version-alert__copy">
      <strong>Update required</strong>
      <span>A newer Pin &amp; Spin version is available. Refresh now to get the latest fixes — your game
        continues after the refresh. If the old version remains, fully close and reopen the game.</span>
    </div>
    <button type="button" onClick={updateNow} disabled={updating}>{updating ? 'Updating…' : 'Update Now'}</button>
  </div>;
}
