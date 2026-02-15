import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { getOutboxSize } from '@/lib/offline-store';
import { syncPendingOperations } from '@/lib/sync-engine';
import { useAuth } from '@/providers/auth-provider';

const SYNC_INTERVAL_MS = 45_000;

type OfflineSyncContextValue = {
  pendingOperations: number;
  isSyncing: boolean;
  lastSyncAt: string | null;
};

const OfflineSyncContext = createContext<OfflineSyncContextValue>({
  pendingOperations: 0,
  isSyncing: false,
  lastSyncAt: null,
});

export function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [pendingOperations, setPendingOperations] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user?.id) {
      setPendingOperations(0);
      setIsSyncing(false);
      setLastSyncAt(null);
      return;
    }

    let active = true;

    const refreshPending = async () => {
      const next = await getOutboxSize(session.user.id);
      if (active) setPendingOperations(next);
    };

    const runSync = async () => {
      if (active) setIsSyncing(true);
      try {
        await syncPendingOperations(session.user.id);
      } catch {
        // Sync will retry automatically on next tick/foreground.
      } finally {
        if (active) {
          setIsSyncing(false);
          setLastSyncAt(new Date().toISOString());
        }
        await refreshPending();
      }
    };

    void refreshPending();
    void runSync();
    const interval = setInterval(runSync, SYNC_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void runSync();
      }
    });

    return () => {
      active = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, [session?.user?.id]);

  const value = useMemo<OfflineSyncContextValue>(
    () => ({
      pendingOperations,
      isSyncing,
      lastSyncAt,
    }),
    [isSyncing, lastSyncAt, pendingOperations]
  );

  return <OfflineSyncContext.Provider value={value}>{children}</OfflineSyncContext.Provider>;
}

export function useOfflineSyncStatus() {
  return useContext(OfflineSyncContext);
}
