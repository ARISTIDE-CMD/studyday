import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

type SupabaseAuthStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const memoryStorage = new Map<string, string>();
const STORAGE_PREFIX = 'supabase-auth-';

function buildFilePath(key: string): string | null {
  if (!FileSystem.documentDirectory) {
    return null;
  }

  return `${FileSystem.documentDirectory}${STORAGE_PREFIX}${encodeURIComponent(key)}.json`;
}

async function getNativeItem(key: string): Promise<string | null> {
  const filePath = buildFilePath(key);

  if (!filePath) {
    return memoryStorage.get(key) ?? null;
  }

  try {
    return await FileSystem.readAsStringAsync(filePath);
  } catch {
    return memoryStorage.get(key) ?? null;
  }
}

async function setNativeItem(key: string, value: string): Promise<void> {
  const filePath = buildFilePath(key);
  memoryStorage.set(key, value);

  if (!filePath) {
    return;
  }

  try {
    await FileSystem.writeAsStringAsync(filePath, value);
  } catch {
    // Keep memory fallback if file write is unavailable.
  }
}

async function removeNativeItem(key: string): Promise<void> {
  const filePath = buildFilePath(key);
  memoryStorage.delete(key);

  if (!filePath) {
    return;
  }

  try {
    await FileSystem.deleteAsync(filePath, { idempotent: true });
  } catch {
    // Ignore deletion errors to keep sign-out flow resilient.
  }
}

function getWebItem(key: string): string | null {
  if (typeof localStorage === 'undefined') {
    return memoryStorage.get(key) ?? null;
  }

  try {
    return localStorage.getItem(key) ?? memoryStorage.get(key) ?? null;
  } catch {
    return memoryStorage.get(key) ?? null;
  }
}

function setWebItem(key: string, value: string): void {
  memoryStorage.set(key, value);

  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(key, value);
  } catch {
    // Keep memory fallback if localStorage is blocked.
  }
}

function removeWebItem(key: string): void {
  memoryStorage.delete(key);

  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore localStorage deletion errors.
  }
}

export const supabaseStorage: SupabaseAuthStorage = {
  getItem: async (key: string) => {
    if (Platform.OS === 'web') {
      return getWebItem(key);
    }

    return getNativeItem(key);
  },
  setItem: async (key: string, value: string) => {
    if (Platform.OS === 'web') {
      setWebItem(key, value);
      return;
    }

    await setNativeItem(key, value);
  },
  removeItem: async (key: string) => {
    if (Platform.OS === 'web') {
      removeWebItem(key);
      return;
    }

    await removeNativeItem(key);
  },
};
