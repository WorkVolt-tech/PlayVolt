// Shared PlayVolt accounts (the same Supabase Auth users and profiles as Dekabess).
// The anon key is the public browser key; game data stays behind the Edge Function.
// The Supabase library is loaded on demand so the home screen stays light.
const SUPABASE_URL = 'https://eybzbtyfafmqbkulyvog.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5YnpidHlmYWZtcWJrdWx5dm9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MjE0MDksImV4cCI6MjA5MDM5NzQwOX0.65mO6dICDWAlS4nh0gBs7tSNobuNMNo103YY0Ylccq8';
const STORAGE_KEY = 'sb-eybzbtyfafmqbkulyvog-auth-token';

let clientPromise = null;
export function getSupabase() {
  clientPromise ||= import('@supabase/supabase-js')
    .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY))
    .catch((error) => { clientPromise = null; throw error; });
  return clientPromise;
}

// True when this browser holds a saved sign-in (checked without loading the library).
export function hasStoredSession() {
  try { return !!localStorage.getItem(STORAGE_KEY); } catch { return false; }
}

// Current access token, refreshed by supabase-js when needed; null for guests.
// Never waits more than a few seconds: when a phone brings the app back from the background,
// supabase-js first refreshes the sign-in over a connection the phone may have dropped, and
// that could hold every game request (the game looked frozen). After the wait, the saved
// token is used if it is still valid; the refresh carries on by itself for later requests.
export const TOKEN_WAIT_MS = 4000;
export async function accessToken({ client = getSupabase, wait = TOKEN_WAIT_MS } = {}) {
  if (!hasStoredSession()) return null;
  const fromClient = (async () => {
    try {
      const { data } = await (await client()).auth.getSession();
      return data.session?.access_token || null;
    } catch {
      return null;
    }
  })();
  let timer;
  const late = new Promise((resolve) => { timer = setTimeout(() => resolve(undefined), wait); });
  const token = await Promise.race([fromClient, late]);
  clearTimeout(timer);
  return token === undefined ? savedToken() : token;
}

// The token supabase-js saved on this device, if it hasn't expired (10 s margin).
export function savedToken(now = Date.now()) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    const token = saved?.access_token;
    if (typeof token === 'string' && (!saved.expires_at || saved.expires_at * 1000 > now + 10000)) return token;
  } catch { /* unreadable: no token */ }
  return null;
}

// Server errors for account problems start with "ACCOUNT_REQUIRED: ".
export const isAccountError = (message) => /^ACCOUNT_REQUIRED:/.test(message || '');
export const cleanMessage = (message) => (message || '').replace(/^ACCOUNT_REQUIRED:\s*/, '');
