import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import {
  defaultSettings,
  loadAppSettings,
  saveAppSettings,
  type AppLanguage,
  type ThemeMode,
} from '@/lib/settings-storage';

type SettingsContextValue = {
  language: AppLanguage;
  themeMode: ThemeMode;
  settingsLoading: boolean;
  setLanguage: (value: AppLanguage) => void;
  setThemeMode: (value: ThemeMode) => void;
};

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(defaultSettings.language);
  const [themeMode, setThemeModeState] = useState<ThemeMode>(defaultSettings.themeMode);
  const [settingsLoading, setSettingsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void (async () => {
      const loaded = await loadAppSettings();
      if (!active) return;
      setLanguageState(loaded.language);
      setThemeModeState(loaded.themeMode);
      setSettingsLoading(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  const setLanguage = (value: AppLanguage) => {
    setLanguageState(value);
  };

  const setThemeMode = (value: ThemeMode) => {
    setThemeModeState(value);
  };

  useEffect(() => {
    if (settingsLoading) return;
    void saveAppSettings({ language, themeMode });
  }, [language, settingsLoading, themeMode]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      language,
      themeMode,
      settingsLoading,
      setLanguage,
      setThemeMode,
    }),
    [language, settingsLoading, themeMode]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings doit etre utilise dans SettingsProvider');
  }
  return context;
}
