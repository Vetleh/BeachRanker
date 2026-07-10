import en from "./locales/en.json";
import no from "./locales/no.json";

export type Language = "no" | "en";
export type TranslationKey = keyof typeof en;

export const translations = {
  en,
  no,
};

type Dictionary = typeof en;
type LeafPaths<T, Prefix extends string = ""> = {
  [Key in keyof T]: T[Key] extends string
    ? `${Prefix}${Extract<Key, string>}`
    : LeafPaths<T[Key], `${Prefix}${Extract<Key, string>}.`>;
}[keyof T];

export type TranslationPath = LeafPaths<Dictionary>;

export function translate(language: Language, path: TranslationPath, values: Record<string, string | number> = {}) {
  const template = path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, translations[language]);

  if (typeof template !== "string") {
    return path;
  }

  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}
