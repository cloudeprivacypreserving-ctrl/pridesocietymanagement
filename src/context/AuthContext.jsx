import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { api } from '../lib/api';

const AuthContext = createContext(null);

// Security accounts get a hard 10-hour session ceiling from login,
// regardless of activity — matches a single-shift security policy.
// Supabase's own session handling is a rolling refresh (no fixed
// "log out N hours after login" concept), so this is enforced by the
// app: the login time is recorded in localStorage (survives reloads)
// and checked on load and periodically while the tab is open.
const SECURITY_SESSION_LIMIT_MS = 10 * 60 * 60 * 1000;
const SESSION_START_KEY = 'security_session_started_at';
const CHECK_INTERVAL_MS = 60 * 1000;

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  // MFA status for the current account/session — null while unknown.
  //   hasVerifiedFactor: the account has completed TOTP enrollment
  //   needsChallenge: a verified factor exists but this session hasn't
  //     completed the AAL2 challenge yet (must re-enter a code)
  const [mfaStatus, setMfaStatus] = useState(null);
  const signOutRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session) loadProfile(data.session.user.id);
      else setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        loadProfile(newSession.user.id);
      } else {
        setProfile(null);
        setMfaStatus(null);
        setLoading(false);
        localStorage.removeItem(SESSION_START_KEY);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session || profile?.role !== 'security') return;

    // Record the start of this session the first time we see a Security
    // user with an active session (covers both a fresh sign-in and a
    // page reload of an already-open session).
    if (!localStorage.getItem(SESSION_START_KEY)) {
      localStorage.setItem(SESSION_START_KEY, String(Date.now()));
    }

    function checkExpiry() {
      const startedAt = Number(localStorage.getItem(SESSION_START_KEY));
      if (startedAt && Date.now() - startedAt >= SECURITY_SESSION_LIMIT_MS) {
        signOutRef.current?.();
      }
    }

    checkExpiry();
    const interval = setInterval(checkExpiry, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [session, profile]);

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role, must_change_password')
      .eq('id', userId)
      .single();
    setProfile(data || null);
    await refreshMfaStatus();
    setLoading(false);
  }

  async function refreshMfaStatus() {
    try {
      const [{ data: aal }, { data: factorsData }] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);
      const verifiedTotp = (factorsData?.totp || []).find((f) => f.status === 'verified');
      setMfaStatus({
        hasVerifiedFactor: !!verifiedTotp,
        // nextLevel is aal2 whenever a verified factor exists; if the
        // current session hasn't completed that challenge yet, currentLevel
        // stays aal1 — that's the "must challenge now" condition.
        needsChallenge: !!verifiedTotp && aal?.currentLevel !== aal?.nextLevel,
      });
    } catch (err) {
      console.error('Failed to read MFA status:', err.message);
      setMfaStatus({ hasVerifiedFactor: false, needsChallenge: false });
    }
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // onAuthStateChange fires loadProfile -> refreshMfaStatus, but do it
    // eagerly too so the caller's next navigation sees fresh state.
    await refreshMfaStatus();
  }

  async function signOut() {
    localStorage.removeItem(SESSION_START_KEY);
    await supabase.auth.signOut();
  }

  signOutRef.current = signOut;

  async function completePasswordSetup(password) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;

    await api.post('/profile/complete-setup');
    setProfile((prev) => (prev ? { ...prev, must_change_password: false } : prev));
  }

  const value = {
    session,
    profile,
    loading,
    mfaStatus,
    signIn,
    signOut,
    completePasswordSetup,
    refreshMfaStatus,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
