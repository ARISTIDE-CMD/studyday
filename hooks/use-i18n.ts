import { useCallback, useMemo } from 'react';

import { getLocaleForLanguage, translate, type I18nParams } from '@/lib/i18n';
import { useSettings } from '@/providers/settings-provider';

export function useI18n() {
  const { language } = useSettings();
  const locale = getLocaleForLanguage(language);

  const t = useCallback(
    (key: string, params?: I18nParams) => translate(language, key, params),
    [language]
  );

  return useMemo(
    () => ({
      language,
      locale,
      t,
    }),
    [language, locale, t]
  );
}
