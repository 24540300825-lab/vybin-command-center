import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase.js';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      // A guest (anonymous) session never counts as signed in here.
      setSession(data.session && !data.session.user.is_anonymous ? data.session : null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s && !s.user.is_anonymous ? s : null);
      setLoading(false);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  const sendLink = useCallback(async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: true },
    });
    return error ? error.message : null;
  }, []);

  const signOut = useCallback(() => supabase.auth.signOut(), []);

  return <AuthCtx.Provider value={{ session, user: session?.user ?? null, loading, sendLink, signOut }}>{children}</AuthCtx.Provider>;
}
