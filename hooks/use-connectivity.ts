import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

const CHECK_INTERVAL_MS = 18_000;
const CHECK_TIMEOUT_MS = 4_500;
const CONNECTIVITY_URL = 'https://clients3.google.com/generate_204';

async function checkConnectivity(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(CONNECTIVITY_URL, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });
    return response.ok || response.status === 204;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export function useConnectivity() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    let active = true;

    const runCheck = async () => {
      const next = await checkConnectivity();
      if (active) setIsOnline(next);
    };

    void runCheck();
    const interval = setInterval(() => {
      void runCheck();
    }, CHECK_INTERVAL_MS);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void runCheck();
      }
    });

    return () => {
      active = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, []);

  return isOnline;
}
