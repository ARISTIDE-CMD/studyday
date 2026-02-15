import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

type AppFlags = {
  homeTourSeen: boolean;
};

const STORAGE_KEY = 'studyday-app-flags-v1';
const FILE_PATH = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}${STORAGE_KEY}.json`
  : null;

const defaultFlags: AppFlags = {
  homeTourSeen: false,
};

function normalizeFlags(value: unknown): AppFlags {
  if (!value || typeof value !== 'object') {
    return { ...defaultFlags };
  }

  const raw = value as Partial<AppFlags>;
  return {
    homeTourSeen: Boolean(raw.homeTourSeen),
  };
}

export async function loadAppFlags(): Promise<AppFlags> {
  if (Platform.OS === 'web') {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (!raw) return { ...defaultFlags };
      return normalizeFlags(JSON.parse(raw));
    } catch {
      return { ...defaultFlags };
    }
  }

  if (!FILE_PATH) {
    return { ...defaultFlags };
  }

  try {
    const raw = await FileSystem.readAsStringAsync(FILE_PATH);
    if (!raw) return { ...defaultFlags };
    return normalizeFlags(JSON.parse(raw));
  } catch {
    return { ...defaultFlags };
  }
}

export async function saveAppFlags(flags: AppFlags): Promise<void> {
  const normalized = normalizeFlags(flags);

  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Ignore persistence errors.
    }
    return;
  }

  if (!FILE_PATH) {
    return;
  }

  try {
    await FileSystem.writeAsStringAsync(FILE_PATH, JSON.stringify(normalized));
  } catch {
    // Ignore persistence errors.
  }
}

