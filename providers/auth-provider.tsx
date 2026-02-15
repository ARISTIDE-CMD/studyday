import type { Session, User } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  createLocalId,
  enqueueOutboxOperation,
  getLocalProfileById,
  removeLocalProfile,
  setLocalProfile,
} from '@/lib/offline-store';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/supabase';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  shouldShowPostLoginIntro: boolean;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  saveProfileLocalFirst: (patch: { full_name?: string | null; avatar_url?: string | null }) => Promise<void>;
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

function fallbackNameFromUser(user: User): string {
  const metadataName =
    typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : '';
  if (metadataName) return metadataName;
  return user.email?.split('@')[0] ?? 'Etudiant';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [shouldShowPostLoginIntro, setShouldShowPostLoginIntro] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    if (!session?.user) {
      setProfile(null);
      return;
    }

    const cached = await getLocalProfileById(session.user.id);
    if (cached) {
      setProfile(cached);
    }

    try {
      const data = await upsertProfile(session.user);
      if (data) {
        await setLocalProfile(session.user.id, data);
      }
      setProfile(data ?? cached ?? null);
    } catch {
      if (!cached) {
        setProfile(null);
      }
    }
  }, [session?.user]);

  const saveProfileLocalFirst = useCallback(async (patch: { full_name?: string | null; avatar_url?: string | null }) => {
    if (!session?.user) {
      return;
    }

    const user = session.user;
    const fallbackName = fallbackNameFromUser(user);
    const nextProfile: Profile = {
      id: user.id,
      full_name:
        patch.full_name !== undefined
          ? patch.full_name
          : (profile?.full_name ?? fallbackName),
      avatar_url:
        patch.avatar_url !== undefined
          ? patch.avatar_url
          : (profile?.avatar_url ?? null),
      role: profile?.role ?? 'student',
      created_at: profile?.created_at ?? new Date().toISOString(),
    };

    setProfile(nextProfile);
    await setLocalProfile(user.id, nextProfile);
    await enqueueOutboxOperation({
      id: createLocalId('op'),
      entity: 'profile',
      action: 'upsert',
      userId: user.id,
      record: nextProfile,
      createdAt: new Date().toISOString(),
    });
  }, [profile, session?.user]);

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
        const cachedProfile = await getLocalProfileById(data.session.user.id);
        if (cachedProfile && active) {
          setProfile(cachedProfile);
        }

        try {
          const dataProfile = await upsertProfile(data.session.user);
          if (dataProfile) {
            await setLocalProfile(data.session.user.id, dataProfile);
          }
          if (active) setProfile(dataProfile ?? cachedProfile ?? null);
        } catch {
          if (active && !cachedProfile) setProfile(null);
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
        const cachedProfile = await getLocalProfileById(nextSession.user.id);
        if (active && cachedProfile) {
          setProfile(cachedProfile);
        }

        try {
          const dataProfile = await upsertProfile(nextSession.user);
          if (dataProfile) {
            await setLocalProfile(nextSession.user.id, dataProfile);
          }
          if (active) setProfile(dataProfile ?? cachedProfile ?? null);
        } catch {
          if (active && !cachedProfile) setProfile(null);
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

  const signOut = useCallback(async () => {
    if (session?.user?.id) {
      await removeLocalProfile(session.user.id);
    }
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setShouldShowPostLoginIntro(false);
  }, [session?.user?.id]);

  const queuePostLoginIntro = useCallback(() => {
    setShouldShowPostLoginIntro(true);
  }, []);

  const consumePostLoginIntro = useCallback(() => {
    setShouldShowPostLoginIntro(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      shouldShowPostLoginIntro,
      loading,
      refreshProfile,
      saveProfileLocalFirst,
      queuePostLoginIntro,
      consumePostLoginIntro,
      signOut,
    }),
    [loading, profile, refreshProfile, saveProfileLocalFirst, session, shouldShowPostLoginIntro]
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
