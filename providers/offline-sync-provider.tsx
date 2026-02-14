import React, { useEffect } from 'react';
import { AppState } from 'react-native';

import { syncPendingOperations } from '@/lib/sync-engine';
import { useAuth } from '@/providers/auth-provider';

const SYNC_INTERVAL_MS = 45_000;

export function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    const runSync = () => {
      void syncPendingOperations(session.user.id).catch(() => {
        // Sync will retry automatically on next tick/foreground.
      });
    };

    runSync();
    const interval = setInterval(runSync, SYNC_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        runSync();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [session?.user?.id]);

  return <>{children}</>;
}
