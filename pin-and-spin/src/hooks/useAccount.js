// Optional PlayVolt account (shared with Dekabess). Guests can always play without one.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../game/auth.js';

export function useAccount() {
  const [user, setUser] = useState(undefined); // undefined while loading
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession()
      .then(({ data }) => { if (active) setUser(data.session?.user ?? null); })
      .catch(() => { if (active) setUser(null); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUser(session?.user ?? null);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const userId = user?.id;
  const loadProfile = useCallback(async () => {
    if (!userId) { setProfile(null); return; }
    const { data } = await supabase.from('profiles').select('id,nickname').eq('id', userId).maybeSingle();
    setProfile(data || null);
  }, [userId]);
  useEffect(() => { void loadProfile().catch(() => setProfile(null)); }, [loadProfile]);

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }
  // Same sign-up as Dekabess: the profile row (with nickname) is created by the database.
  async function signUp(email, password, nickname) {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { nickname }, emailRedirectTo: location.origin + location.pathname },
    });
    if (error) throw error;
    return { needsConfirmation: !data.session };
  }
  async function signOut() { await supabase.auth.signOut(); }

  return { user, profile, loading: user === undefined, signedIn: !!user, signIn, signUp, signOut };
}
