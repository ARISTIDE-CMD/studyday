import type { Session, User } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { createRemoteE2eeKeyBackup, hasRemoteE2eeKeyBackup, restoreRemoteE2eeKeyBackup } from '@/lib/e2ee-key-backup';
import { decryptE2eeString, encryptE2eeString, hasLocalEncryptionKey } from '@/lib/offline-crypto';
import {
  createLocalId,
  enqueueOutboxOperation,
  getLocalProfileById,
  getOutboxOperations,
  removeLocalProfile,
  setLocalProfile,
} from '@/lib/offline-store';
import { hydrateLocalDataFromRemote } from '@/lib/student-api';
import { hydrateStudySchedulesFromRemote } from '@/lib/study-schedule';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/supabase';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  shouldShowPostLoginIntro: boolean;
  loading: boolean;
  e2eeRecoveryRequired: boolean;
  e2eeRecoveryLoading: boolean;
  refreshProfile: (options?: { remote?: boolean }) => Promise<void>;
  saveProfileLocalFirst: (patch: { full_name?: string | null; avatar_url?: string | null }) => Promise<void>;
  saveE2eeBackup: (passphrase: string) => Promise<string>;
  restoreE2eeFromCloud: (passphrase: string) => Promise<void>;
  queuePostLoginIntro: () => void;
  consumePostLoginIntro: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function pickString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function resolveProfileMetadata(user: User): { fullName: string | null; avatarUrl: string | null } {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;

  const givenName = pickString(metadata.given_name);
  const familyName = pickString(metadata.family_name);
  const combinedName =
    givenName && familyName ? `${givenName} ${familyName}` : (givenName ?? familyName ?? null);

  const fullName =
    pickString(metadata.full_name) ??
    pickString(metadata.name) ??
    pickString(metadata.display_name) ??
    combinedName ??
    user.email?.split('@')[0] ??
    null;

  const avatarUrl =
    pickString(metadata.avatar_url) ??
    pickString(metadata.picture) ??
    pickString(metadata.photo_url) ??
    null;

  return { fullName, avatarUrl };
}

async function decryptProfileRecord(profile: Profile): Promise<Profile> {
  const [fullName, avatarUrl] = await Promise.all([
    decryptE2eeString(profile.full_name),
    decryptE2eeString(profile.avatar_url),
  ]);

  return {
    ...profile,
    full_name: fullName,
    avatar_url: avatarUrl,
  };
}

async function upsertProfile(user: User): Promise<Profile | null> {
  const { fullName, avatarUrl } = resolveProfileMetadata(user);
  const [encryptedFullName, encryptedAvatarUrl] = await Promise.all([
    encryptE2eeString(fullName),
    encryptE2eeString(avatarUrl),
  ]);

  const { error: bootstrapError } = await supabase
    .from('profiles')
    .upsert(
      { id: user.id, full_name: encryptedFullName, avatar_url: encryptedAvatarUrl },
      { onConflict: 'id', ignoreDuplicates: true }
    );

  if (bootstrapError) {
    throw bootstrapError;
  }

  const { data, error: fetchError } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, role, created_at')
    .eq('id', user.id)
    .maybeSingle<Profile>();

  if (fetchError) {
    throw fetchError;
  }

  if (!data) {
    return null;
  }

  const decryptedData = await decryptProfileRecord(data);
  const patch: Partial<Profile> = {};
  if (!decryptedData.full_name && fullName) {
    patch.full_name = fullName;
  }
  if (!decryptedData.avatar_url && avatarUrl) {
    patch.avatar_url = avatarUrl;
  }

  if (Object.keys(patch).length === 0) {
    return decryptedData;
  }

  const encryptedPatch: { full_name?: string | null; avatar_url?: string | null } = {};
  if (patch.full_name !== undefined) {
    encryptedPatch.full_name = await encryptE2eeString(patch.full_name);
  }
  if (patch.avatar_url !== undefined) {
    encryptedPatch.avatar_url = await encryptE2eeString(patch.avatar_url);
  }

  const { data: patched, error: patchError } = await supabase
    .from('profiles')
    .update(encryptedPatch)
    .eq('id', user.id)
    .select('id, full_name, avatar_url, role, created_at')
    .maybeSingle<Profile>();

  if (patchError) {
    throw patchError;
  }

  if (patched) {
    return decryptProfileRecord(patched);
  }

  return { ...decryptedData, ...patch };
}

function fallbackNameFromUser(user: User): string {
  const metadata = resolveProfileMetadata(user);
  return metadata.fullName ?? 'Etudiant';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [shouldShowPostLoginIntro, setShouldShowPostLoginIntro] = useState(false);
  const [loading, setLoading] = useState(true);
  const [e2eeRecoveryRequired, setE2eeRecoveryRequired] = useState(false);
  const [e2eeRecoveryLoading, setE2eeRecoveryLoading] = useState(false);

  const hasPendingProfileSync = useCallback(async (userId: string) => {
    const operations = await getOutboxOperations(userId);
    return operations.some((operation) => operation.entity === 'profile' && operation.action === 'upsert');
  }, []);

  const resolveE2eeRecoveryState = useCallback(async (userId: string): Promise<boolean> => {
    const hasLocalKey = await hasLocalEncryptionKey();
    if (hasLocalKey) {
      setE2eeRecoveryRequired(false);
      return false;
    }

    try {
      const hasRemoteBackup = await hasRemoteE2eeKeyBackup(userId);
      setE2eeRecoveryRequired(hasRemoteBackup);
      return hasRemoteBackup;
    } catch {
      setE2eeRecoveryRequired(false);
      return false;
    }
  }, []);

  const refreshProfile = useCallback(async (options?: { remote?: boolean }) => {
    if (!session?.user) {
      setProfile(null);
      return;
    }

    const cached = await getLocalProfileById(session.user.id);
    if (cached) {
      setProfile(cached);
    }

    if (!options?.remote || e2eeRecoveryRequired) {
      return;
    }

    try {
      const pendingProfileSync = await hasPendingProfileSync(session.user.id);
      const data = await upsertProfile(session.user);
      if (data && !pendingProfileSync) {
        await setLocalProfile(session.user.id, data);
      }
      setProfile(pendingProfileSync ? (cached ?? data ?? null) : (data ?? cached ?? null));
    } catch {
      if (!cached) {
        setProfile(null);
      }
    }
  }, [e2eeRecoveryRequired, hasPendingProfileSync, session?.user]);

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

  const saveE2eeBackup = useCallback(async (passphrase: string): Promise<string> => {
    if (!session?.user?.id) {
      throw new Error('Session utilisateur introuvable.');
    }

    const payload = await createRemoteE2eeKeyBackup(session.user.id, passphrase);
    setE2eeRecoveryRequired(false);
    return payload;
  }, [session?.user?.id]);

  const restoreE2eeFromCloud = useCallback(async (passphrase: string): Promise<void> => {
    if (!session?.user?.id) {
      throw new Error('Session utilisateur introuvable.');
    }

    setE2eeRecoveryLoading(true);
    try {
      await restoreRemoteE2eeKeyBackup(session.user.id, passphrase);
      setE2eeRecoveryRequired(false);

      const restoredProfile = await upsertProfile(session.user);
      if (restoredProfile) {
        await setLocalProfile(session.user.id, restoredProfile);
        setProfile(restoredProfile);
      }

      await Promise.all([
        hydrateLocalDataFromRemote(session.user.id),
        hydrateStudySchedulesFromRemote(session.user.id),
      ]);
    } finally {
      setE2eeRecoveryLoading(false);
    }
  }, [session?.user]);

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
        const userId = data.session.user.id;
        const cachedProfile = await getLocalProfileById(userId);
        if (cachedProfile && active) {
          setProfile(cachedProfile);
        }

        const requiresE2eeRecovery = await resolveE2eeRecoveryState(userId);
        if (!requiresE2eeRecovery) {
          try {
            const pendingProfileSync = await hasPendingProfileSync(userId);
            const dataProfile = await upsertProfile(data.session.user);
            if (dataProfile && !pendingProfileSync) {
              await setLocalProfile(userId, dataProfile);
            }
            if (active) {
              setProfile(
                pendingProfileSync
                  ? (cachedProfile ?? dataProfile ?? null)
                  : (dataProfile ?? cachedProfile ?? null)
              );
            }
          } catch {
            if (active && !cachedProfile) setProfile(null);
          }

          void Promise.all([
            hydrateLocalDataFromRemote(userId),
            hydrateStudySchedulesFromRemote(userId),
          ]).catch(() => {
            // Keep cached experience if remote hydration fails.
          });
        }
      } else {
        setProfile(null);
        setE2eeRecoveryRequired(false);
      }

      if (active) setLoading(false);
    };

    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);

      if (!nextSession?.user) {
        setProfile(null);
        setShouldShowPostLoginIntro(false);
        setE2eeRecoveryRequired(false);
        setLoading(false);
        return;
      }

      const shouldHydrateRemote = event === 'SIGNED_IN' || event === 'USER_UPDATED';

      if (!shouldHydrateRemote) {
        void (async () => {
          const userId = nextSession.user.id;
          const cachedProfile = await getLocalProfileById(userId);
          if (active && cachedProfile) {
            setProfile(cachedProfile);
          }
          await resolveE2eeRecoveryState(userId);
          if (active) setLoading(false);
        })();
        return;
      }

      void (async () => {
        const userId = nextSession.user.id;
        const cachedProfile = await getLocalProfileById(userId);
        if (active && cachedProfile) {
          setProfile(cachedProfile);
        }

        const requiresE2eeRecovery = await resolveE2eeRecoveryState(userId);
        if (requiresE2eeRecovery) {
          if (active) setLoading(false);
          return;
        }

        try {
          const pendingProfileSync = await hasPendingProfileSync(userId);
          const dataProfile = await upsertProfile(nextSession.user);
          if (dataProfile && !pendingProfileSync) {
            await setLocalProfile(userId, dataProfile);
          }
          if (active) {
            setProfile(
              pendingProfileSync
                ? (cachedProfile ?? dataProfile ?? null)
                : (dataProfile ?? cachedProfile ?? null)
            );
          }
        } catch {
          if (active && !cachedProfile) setProfile(null);
        } finally {
          void Promise.all([
            hydrateLocalDataFromRemote(userId),
            hydrateStudySchedulesFromRemote(userId),
          ]).catch(() => {
            // Keep cached experience if remote hydration fails.
          });

          if (active) setLoading(false);
        }
      })();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [hasPendingProfileSync, resolveE2eeRecoveryState]);

  const signOut = useCallback(async () => {
    if (session?.user?.id) {
      await removeLocalProfile(session.user.id);
    }
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setShouldShowPostLoginIntro(false);
    setE2eeRecoveryRequired(false);
    setE2eeRecoveryLoading(false);
  }, [session?.user?.id]);

  const queuePostLoginIntro = useCallback(() => {
    setShouldShowPostLoginIntro(true);
  }, [hasPendingProfileSync, resolveE2eeRecoveryState]);

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
      e2eeRecoveryRequired,
      e2eeRecoveryLoading,
      refreshProfile,
      saveProfileLocalFirst,
      saveE2eeBackup,
      restoreE2eeFromCloud,
      queuePostLoginIntro,
      consumePostLoginIntro,
      signOut,
    }),
    [
      e2eeRecoveryLoading,
      e2eeRecoveryRequired,
      loading,
      profile,
      refreshProfile,
      restoreE2eeFromCloud,
      saveE2eeBackup,
      saveProfileLocalFirst,
      session,
      shouldShowPostLoginIntro,
    ]
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
