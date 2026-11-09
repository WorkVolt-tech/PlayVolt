// The only network entry point: every action goes through the pin-and-spin Edge Function.
import { API } from './constants.js';
import { accessToken, cleanMessage } from './auth.js';

// When the app comes back from the background, a request that was under way when it left is
// usually dead (the phone dropped the connection) and its time limit was paused too. Drop it
// at once instead of making the player wait for it; the game simply asks again.
let hiddenAt = 0;
const onResume = new Set();
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else onResume.forEach((fn) => fn());
  });
}

export async function callGame(action, session, data = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 13000);
  const started = Date.now();
  let resumed = false;
  const dropIfStale = () => { if (hiddenAt >= started) { resumed = true; controller.abort(); } };
  onResume.add(dropIfStale);
  try {
    // Signed-in players send their account token; the server verifies it with Supabase Auth.
    const auth = await accessToken();
    const response = await fetch(API, {
      method: 'POST', cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
      body: JSON.stringify({
        action,
        code: session.code || '',
        token: session.token,
        data,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) {
      const error = new Error(cleanMessage(payload.error) || 'The game service could not complete this request.');
      error.accountRequired = /^ACCOUNT_REQUIRED:/.test(payload.error || '');
      throw error;
    }
    return payload;
  } catch (error) {
    if (resumed) {
      const dropped = new Error('The connection dropped while the app was in the background. Please try again.');
      dropped.resumed = true;
      throw dropped;
    }
    if (error.name === 'AbortError') throw new Error('The server took too long. Try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
    onResume.delete(dropIfStale);
  }
}
