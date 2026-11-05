// The only network entry point: every action goes through the pin-and-spin Edge Function.
import { API } from './constants.js';
import { accessToken, cleanMessage } from './auth.js';

export async function callGame(action, session, data = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 13000);
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
    if (error.name === 'AbortError') throw new Error('The server took too long. Try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
