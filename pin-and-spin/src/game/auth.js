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
export async function accessToken() {
  if (!hasStoredSession()) return null;
  try {
    const { data } = await (await getSupabase()).auth.getSession();
    return data.session?.access_token || null;
  } catch {
    return null;
  }
}

// Server errors for account problems start with "ACCOUNT_REQUIRED: ".
export const isAccountError = (message) => /^ACCOUNT_REQUIRED:/.test(message || '');
export const cleanMessage = (message) => (message || '').replace(/^ACCOUNT_REQUIRED:\s*/, '');
