import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { getOutboxSize } from '@/lib/offline-store';
import { syncPendingOperations } from '@/lib/sync-engine';
import { useAuth } from '@/providers/auth-provider';
import { useSettings } from '@/providers/settings-provider';

const SYNC_INTERVAL_MS = 45_000;
const PENDING_REFRESH_MS = 12_000;

type OfflineSyncContextValue = {
  pendingOperations: number;
  isSyncing: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: 'success' | 'error' | null;
  lastSyncedCount: number;
  triggerSync: () => Promise<void>;
};

const OfflineSyncContext = createContext<OfflineSyncContextValue>({
  pendingOperations: 0,
  isSyncing: false,
  lastSyncAt: null,
  lastSyncStatus: null,
  lastSyncedCount: 0,
  triggerSync: async () => {},
});

export function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const { syncMode } = useSettings();
  const [pendingOperations, setPendingOperations] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastSyncStatus, setLastSyncStatus] = useState<'success' | 'error' | null>(null);
  const [lastSyncedCount, setLastSyncedCount] = useState(0);
  const syncingRef = useRef(false);

  const userId = session?.user?.id;

  const refreshPending = useCallback(async () => {
    if (!userId) {
      setPendingOperations(0);
      return;
    }

    const next = await getOutboxSize(userId);
    setPendingOperations(next);
  }, [userId]);

  const runSync = useCallback(async () => {
    if (!userId) return;
    if (syncingRef.current) return;

    syncingRef.current = true;
    setIsSyncing(true);
    setLastSyncStatus(null);

    try {
      const result = await syncPendingOperations(userId);
      setLastSyncStatus('success');
      setLastSyncedCount(result.syncedCount);
    } catch {
      setLastSyncStatus('error');
      setLastSyncedCount(0);
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
      setLastSyncAt(new Date().toISOString());
      await refreshPending();
    }
  }, [refreshPending, userId]);

  const triggerSync = useCallback(async () => {
    await runSync();
  }, [runSync]);

  useEffect(() => {
    if (!userId) {
      setPendingOperations(0);
      setIsSyncing(false);
      setLastSyncAt(null);
      setLastSyncStatus(null);
      setLastSyncedCount(0);
      return;
    }

    let active = true;

    void refreshPending();
    if (syncMode === 'auto') {
      void runSync();
    }

    const interval = setInterval(
      () => {
        if (syncMode === 'auto') {
          void runSync();
          return;
        }
        void refreshPending();
      },
      syncMode === 'auto' ? SYNC_INTERVAL_MS : PENDING_REFRESH_MS
    );
    const subscription = AppState.addEventListener('change', (state) => {
      if (!active || state !== 'active') return;
      if (syncMode === 'auto') {
        void runSync();
        return;
      }
      void refreshPending();
    });

    return () => {
      active = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, [refreshPending, runSync, syncMode, userId]);

  const value = useMemo<OfflineSyncContextValue>(
    () => ({
      pendingOperations,
      isSyncing,
      lastSyncAt,
      lastSyncStatus,
      lastSyncedCount,
      triggerSync,
    }),
    [isSyncing, lastSyncAt, lastSyncStatus, lastSyncedCount, pendingOperations, triggerSync]
  );

  return <OfflineSyncContext.Provider value={value}>{children}</OfflineSyncContext.Provider>;
}

export function useOfflineSyncStatus() {
  return useContext(OfflineSyncContext);
}
