import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { languageOptions, translate, type Language, type TranslationKey } from "../../i18n";

const languageKey = "beachranker_language";

export type LocaleState = {
  language: Language;
  dateLocale: string;
  t: (key: TranslationKey) => string;
  setLanguage: (language: Language) => Promise<void>;
};

export const LocaleContext = createContext<LocaleState | null>(null);

export function useLocale(): LocaleState {
  const [language, setLanguageState] = useState<Language>("no");
  const selectedOption = languageOptions.find((option) => option.value === language) ?? languageOptions[0];

  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(languageKey)
      .then((saved) => {
        if (active && (saved === "no" || saved === "en")) {
          setLanguageState(saved);
        }
      })
      .catch(() => {
        // The app can still switch language for this session if persistence fails.
      });

    return () => {
      active = false;
    };
  }, []);

  const setLanguage = useCallback(async (nextLanguage: Language) => {
    setLanguageState(nextLanguage);
    await SecureStore.setItemAsync(languageKey, nextLanguage);
  }, []);

  return useMemo(
    () => ({
      language,
      dateLocale: selectedOption.dateLocale,
      t: (key: TranslationKey) => translate(language, key),
      setLanguage,
    }),
    [language, selectedOption.dateLocale, setLanguage],
  );
}

export function useLocaleContext() {
  const value = useContext(LocaleContext);
  if (!value) {
    throw new Error("Locale context is not available");
  }
  return value;
}
