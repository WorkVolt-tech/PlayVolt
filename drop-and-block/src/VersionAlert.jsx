import React, { useCallback, useEffect, useRef, useState } from 'react';

// Same version.json polling and foreground checks as Pin & Spin.
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
const CHECK_EVERY_MS = 60 * 1000;

export function VersionAlert({ autoUpdate = false }) {
  const [latestVersion, setLatestVersion] = useState(null);
  const [updating, setUpdating] = useState(false);
  const lastCheck = useRef(0);

  const checkVersion = useCallback(async ({ force = false } = {}) => {
    const now = Date.now();
    if (!force && now - lastCheck.current < CHECK_EVERY_MS) return;
    lastCheck.current = now;
    try {
      const response = await fetch('/version.json?t=' + now,
        { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
      if (!response.ok) return;
      const { version } = await response.json();
      if (version && version !== APP_VERSION) setLatestVersion(version);
    } catch { /* offline: don't interrupt gameplay */ }
  }, []);

  useEffect(() => {
    if (APP_VERSION === 'dev') return undefined;
    void checkVersion({ force: true });
    const timer = setInterval(() => void checkVersion(), CHECK_EVERY_MS);
    const onFocus = () => void checkVersion({ force: true });
    const onVisible = () => { if (document.visibilityState === 'visible') void checkVersion({ force: true }); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [checkVersion]);

  useEffect(() => {
    if (!autoUpdate || !latestVersion) return undefined;
    try {
      if (sessionStorage.getItem('drop_block_tv_auto_update') === latestVersion) return undefined;
      sessionStorage.setItem('drop_block_tv_auto_update', latestVersion);
    } catch { /* private mode still allows a refresh */ }
    const timer = window.setTimeout(() => window.location.reload(), 4000);
    return () => window.clearTimeout(timer);
  }, [autoUpdate, latestVersion]);

  if (!latestVersion) return null;
  return <div className="version-alert" role="alert" aria-live="assertive">
    <div className="version-alert__copy">
      <strong>Update required</strong>
      <span>A newer Drop &amp; Block version is available. Refresh now to get the latest
        fixes. Online rooms automatically reconnect after refreshing. A local demo will restart.</span>
    </div>
    <button type="button" disabled={updating} onClick={() => {
      setUpdating(true);
      window.setTimeout(() => window.location.reload(), 350);
    }}>{updating ? 'Updating…' : 'Update Now'}</button>
  </div>;
}
