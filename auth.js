/* ╔══════════════════════════════════════════════════════════════╗
   ║           PLAYVOLT — auth.js  (no-auth build)              ║
   ║  Drop this next to index.html. Game pages use it to        ║
   ║  check whether admin mode is active (adult tier) or not.  ║
   ║                                                            ║
   ║  USAGE in a game page:                                     ║
   ║    <script src="../auth.js"></script>                      ║
   ║    PlayVolt.requireAuth({ minTier: 'adult' })              ║
   ║      .then(({ user, profile }) => { startGame(); })        ║
   ║      .catch(() => { /* redirected to hub */ });            ║
   ╚══════════════════════════════════════════════════════════════╝ */

const PlayVolt = (() => {
  'use strict';

  const HUB_URL = '../index.html';   // adjust if your hub lives elsewhere

  /* ─────────────────────────────────────
     _getSession()
     Reads the session info written by the
     hub when a game is launched.
  ───────────────────────────────────── */
  function _getSession() {
    try {
      const raw = sessionStorage.getItem('playvolt_session');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /* ─────────────────────────────────────
     getSession()
     Returns a session-like object so game
     pages can read admin / game_id info.
     Always resolves (no network call).
  ───────────────────────────────────── */
  function getSession() {
    const session = _getSession();
    if (!session) return null;

    const profile = {
      username: 'Player',
      age_tier: session.admin ? 'adult' : 'minor',
      is_admin: !!session.admin,
    };

    return { session, user: { id: 'local', email: null }, profile };
  }

  /* ─────────────────────────────────────
     requireAuth({ minTier })
     minTier: 'adult' | 'minor' | 'any'

     - 'any'   → always resolves
     - 'adult' → resolves only if admin mode
                 is active; otherwise redirects
                 back to the hub
  ───────────────────────────────────── */
  async function requireAuth({ minTier = 'any' } = {}) {
    const ctx = getSession();
    const isAdmin = ctx?.profile?.is_admin || false;

    if (minTier === 'adult' && !isAdmin) {
      window.location.href = HUB_URL;
      return Promise.reject('insufficient_tier');
    }

    return {
      user:    ctx?.user    || { id: 'local', email: null },
      profile: ctx?.profile || { username: 'Player', age_tier: 'minor', is_admin: false },
    };
  }

  /* ─────────────────────────────────────
     logout()
     Clears session and returns to hub.
  ───────────────────────────────────── */
  function logout() {
    sessionStorage.removeItem('playvolt_session');
    sessionStorage.removeItem('playvolt_admin');
    window.location.href = HUB_URL;
  }

  return { getSession, requireAuth, logout };
})();
