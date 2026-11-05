// Optional PlayVolt account (shared with Dekabess). Guests can always play without one.
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase, hasStoredSession } from '../game/auth.js';

export function useAccount() {
  const [user, setUser] = useState(() => (hasStoredSession() ? undefined : null)); // undefined while loading
  const [profile, setProfile] = useState(null);
  const listening = useRef(null);

  // Load the library and follow sign-in changes (only when an account is in play).
  const connect = useCallback(async () => {
    const supabase = await getSupabase();
    if (!listening.current) {
      listening.current = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null)).data.subscription;
    }
    return supabase;
  }, []);

  useEffect(() => {
    let active = true;
    if (hasStoredSession()) {
      connect()
        .then((supabase) => supabase.auth.getSession())
        .then(({ data }) => { if (active) setUser(data.session?.user ?? null); })
        .catch(() => { if (active) setUser(null); });
    }
    return () => { active = false; listening.current?.unsubscribe(); listening.current = null; };
  }, [connect]);

  const userId = user?.id;
  const loadProfile = useCallback(async () => {
    if (!userId) { setProfile(null); return; }
    const { data } = await (await getSupabase()).from('profiles').select('id,nickname').eq('id', userId).maybeSingle();
    setProfile(data || null);
  }, [userId]);
  useEffect(() => { void loadProfile().catch(() => setProfile(null)); }, [loadProfile]);

  async function signIn(email, password) {
    const supabase = await connect();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    setUser(data.user ?? null);
  }
  // Same sign-up as Dekabess: the profile row (with nickname) is created by the database.
  async function signUp(email, password, nickname) {
    const supabase = await connect();
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { nickname } },
    });
    if (error) throw error;
    if (data.session) setUser(data.user ?? null);
    return { needsConfirmation: !data.session };
  }
  async function signOut() {
    await (await connect()).auth.signOut();
    setUser(null);
  }

  return { user, profile, loading: user === undefined, signedIn: !!user, signIn, signUp, signOut };
}
