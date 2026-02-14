import type { Session, User } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/supabase';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  shouldShowPostLoginIntro: boolean;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  queuePostLoginIntro: () => void;
  consumePostLoginIntro: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function upsertProfile(user: User): Promise<Profile | null> {
  const fullName =
    typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()
      ? user.user_metadata.full_name.trim()
      : user.email?.split('@')[0] ?? null;

  const { error } = await supabase
    .from('profiles')
    .upsert({ id: user.id, full_name: fullName }, { onConflict: 'id' });

  if (error) {
    throw error;
  }

  const { data, error: fetchError } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, role, created_at')
    .eq('id', user.id)
    .maybeSingle<Profile>();

  if (fetchError) {
    throw fetchError;
  }

  return data ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [shouldShowPostLoginIntro, setShouldShowPostLoginIntro] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    if (!session?.user) {
      setProfile(null);
      return;
    }

    const data = await upsertProfile(session.user);
    setProfile(data);
  };

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (!active) return;

      if (error) {
        setLoading(false);
        return;
      }

      setSession(data.session);

      if (data.session?.user) {
        try {
          const dataProfile = await upsertProfile(data.session.user);
          if (active) setProfile(dataProfile);
        } catch {
          if (active) setProfile(null);
        }
      } else {
        setProfile(null);
      }

      if (active) setLoading(false);
    };

    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);

      if (!nextSession?.user) {
        setProfile(null);
        setShouldShowPostLoginIntro(false);
        setLoading(false);
        return;
      }

      void (async () => {
        try {
          const dataProfile = await upsertProfile(nextSession.user);
          if (active) setProfile(dataProfile);
        } catch {
          if (active) setProfile(null);
        } finally {
          if (active) setLoading(false);
        }
      })();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setShouldShowPostLoginIntro(false);
  };

  const queuePostLoginIntro = () => {
    setShouldShowPostLoginIntro(true);
  };

  const consumePostLoginIntro = () => {
    setShouldShowPostLoginIntro(false);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      shouldShowPostLoginIntro,
      loading,
      refreshProfile,
      queuePostLoginIntro,
      consumePostLoginIntro,
      signOut,
    }),
    [loading, profile, session, shouldShowPostLoginIntro]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth doit etre utilise dans AuthProvider');
  }

  return context;
}
