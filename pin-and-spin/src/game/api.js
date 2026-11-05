// The only network entry point: every action goes through the pin-and-spin Edge Function.
import { API } from './constants.js';

export async function callGame(action, session, data = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 13000);
  try {
    const response = await fetch(API, {
      method: 'POST', cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        code: session.code || '',
        token: session.token,
        data,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) {
      throw new Error(payload.error || 'The game service could not complete this request.');
    }
    return payload;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The server took too long. Try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
