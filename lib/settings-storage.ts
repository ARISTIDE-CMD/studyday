import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

export type ThemeMode = 'system' | 'light' | 'dark';
export type AppLanguage = 'fr' | 'en';

export type AppSettings = {
  themeMode: ThemeMode;
  language: AppLanguage;
};

const STORAGE_KEY = 'studyday-app-settings-v1';
const FILE_PATH = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}${STORAGE_KEY}.json`
  : null;

export const defaultSettings: AppSettings = {
  themeMode: 'system',
  language: 'fr',
};

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

function isLanguage(value: unknown): value is AppLanguage {
  return value === 'fr' || value === 'en';
}

function normalizeSettings(value: unknown): AppSettings {
  if (!value || typeof value !== 'object') {
    return { ...defaultSettings };
  }

  const raw = value as Partial<AppSettings>;
  return {
    themeMode: isThemeMode(raw.themeMode) ? raw.themeMode : defaultSettings.themeMode,
    language: isLanguage(raw.language) ? raw.language : defaultSettings.language,
  };
}

export async function loadAppSettings(): Promise<AppSettings> {
  if (Platform.OS === 'web') {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (!raw) return { ...defaultSettings };
      return normalizeSettings(JSON.parse(raw));
    } catch {
      return { ...defaultSettings };
    }
  }

  if (!FILE_PATH) {
    return { ...defaultSettings };
  }

  try {
    const raw = await FileSystem.readAsStringAsync(FILE_PATH);
    if (!raw) return { ...defaultSettings };
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { ...defaultSettings };
  }
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  const normalized = normalizeSettings(settings);

  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Ignore persistence errors and keep runtime settings.
    }
    return;
  }

  if (!FILE_PATH) {
    return;
  }

  try {
    await FileSystem.writeAsStringAsync(FILE_PATH, JSON.stringify(normalized));
  } catch {
    // Ignore persistence errors and keep runtime settings.
  }
}
