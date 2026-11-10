import { revokeCurrentDevice } from '@/lib/push-device';
import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { registerAuthAppStateRefresh } from '@/lib/auth-app-state';
import { supabase } from '@/lib/supabase';

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_BOOT_TIMEOUT_MS = 1_500;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const bootTimeout = setTimeout(() => {
      if (mounted) setLoading(false);
    }, AUTH_BOOT_TIMEOUT_MS);

    void supabase.auth.getSession()
      .then(({ data }) => {
        if (mounted) setSession(data.session);
      })
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(bootTimeout);
        if (mounted) setLoading(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      clearTimeout(bootTimeout);
      setSession(nextSession);
      setLoading(false);
    });

    const unregisterAppStateRefresh = Platform.OS === 'web'
      ? null
      : registerAuthAppStateRefresh(supabase.auth, AppState);

    return () => {
      mounted = false;
      clearTimeout(bootTimeout);
      subscription.subscription.unsubscribe();
      unregisterAppStateRefresh?.();
    };
  }, []);

  const signOut = async () => {
    await revokeCurrentDevice();
    await supabase.auth.signOut();
  };

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      signOut,
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
