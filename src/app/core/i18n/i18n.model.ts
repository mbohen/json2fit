export type SupportedLanguage = 'pl' | 'en';

export interface LanguageOption {
  code: SupportedLanguage;
  label: string;
  nativeLabel: string;
}

export type TranslationPrimitive = string | number | boolean | null;
export type TranslationValue = TranslationPrimitive | TranslationDictionary | TranslationValue[];

export interface TranslationDictionary {
  [key: string]: TranslationValue;
}

export type TranslationParams = Record<string, string | number | boolean | null | undefined>;

export const LANGUAGE_STORAGE_KEY = 'json2fit.language';
export const FALLBACK_LANGUAGE: SupportedLanguage = 'en';

export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { code: 'pl', label: 'Polish', nativeLabel: 'Polski' },
  { code: 'en', label: 'English', nativeLabel: 'English' }
];

export const LANGUAGE_LOCALES: Record<SupportedLanguage, string> = {
  pl: 'pl-PL',
  en: 'en-US'
};

export function isSupportedLanguage(value: string | null | undefined): value is SupportedLanguage {
  return value === 'pl' || value === 'en';
}
