import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, isDevMode, signal } from '@angular/core';
import enTranslations from '../../../assets/i18n/en.json';
import plTranslations from '../../../assets/i18n/pl.json';
import {
  FALLBACK_LANGUAGE,
  LANGUAGE_LOCALES,
  LANGUAGE_STORAGE_KEY,
  SupportedLanguage,
  TranslationDictionary,
  TranslationParams,
  TranslationValue,
  isSupportedLanguage
} from './i18n.model';

type Dictionaries = Record<SupportedLanguage, TranslationDictionary>;

const STATIC_TRANSLATIONS: Dictionaries = {
  en: enTranslations as TranslationDictionary,
  pl: plTranslations as TranslationDictionary
};

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly currentLanguage = signal<SupportedLanguage>(FALLBACK_LANGUAGE);
  readonly dictionaries = signal<Dictionaries>(STATIC_TRANSLATIONS);
  readonly locale = computed(() => LANGUAGE_LOCALES[this.currentLanguage()]);

  private readonly document = inject(DOCUMENT);
  private readonly missingKeys = new Set<string>();
  private readonly loadedRuntimeLanguages = new Set<SupportedLanguage>();

  constructor() {
    const initialLanguage = this.detectInitialLanguage();
    this.applyLanguage(initialLanguage, false);
    void this.loadRuntimeDictionary(FALLBACK_LANGUAGE);
    if (initialLanguage !== FALLBACK_LANGUAGE) {
      void this.loadRuntimeDictionary(initialLanguage);
    }
  }

  async setLanguage(language: SupportedLanguage): Promise<void> {
    this.applyLanguage(language, true);
    await this.loadRuntimeDictionary(language);
  }

  t(key: string, params?: TranslationParams): string {
    const language = this.currentLanguage();
    const value = this.lookup(language, key) ?? this.lookup(FALLBACK_LANGUAGE, key);
    if (typeof value !== 'string') {
      this.warnMissingKey(language, key);
      return key;
    }
    return interpolate(value, params);
  }

  value<T = TranslationValue>(key: string): T | null {
    const language = this.currentLanguage();
    const value = this.lookup(language, key) ?? this.lookup(FALLBACK_LANGUAGE, key);
    return value === undefined ? null : (value as T);
  }

  list<T = unknown>(key: string): readonly T[] {
    const value = this.value<unknown>(key);
    return Array.isArray(value) ? (value as T[]) : [];
  }

  formatDate(value: string | Date, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }): string {
    return new Intl.DateTimeFormat(this.locale(), options).format(typeof value === 'string' ? new Date(value) : value);
  }

  formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(this.locale(), options).format(value);
  }

  private applyLanguage(language: SupportedLanguage, persist: boolean): void {
    this.currentLanguage.set(language);
    this.document.documentElement.lang = language;
    if (persist) {
      safeLocalStorage(this.document)?.setItem(LANGUAGE_STORAGE_KEY, language);
    }
  }

  private detectInitialLanguage(): SupportedLanguage {
    const storage = safeLocalStorage(this.document);
    const stored = storage?.getItem(LANGUAGE_STORAGE_KEY);
    if (isSupportedLanguage(stored)) {
      return stored;
    }

    const browserLanguage = this.document.defaultView?.navigator.language;
    return browserLanguage?.toLowerCase().startsWith('pl') ? 'pl' : FALLBACK_LANGUAGE;
  }

  private async loadRuntimeDictionary(language: SupportedLanguage): Promise<void> {
    if (this.loadedRuntimeLanguages.has(language) || typeof this.document.defaultView?.fetch !== 'function') {
      return;
    }
    this.loadedRuntimeLanguages.add(language);

    try {
      const url = new URL(`assets/i18n/${language}.json`, this.document.baseURI).toString();
      const response = await this.document.defaultView.fetch(url, { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const dictionary = (await response.json()) as TranslationDictionary;
      this.dictionaries.update((current) => ({
        ...current,
        [language]: dictionary
      }));
    } catch (error) {
      if (isDevMode()) {
        console.warn(`Could not load runtime translations for ${language}:`, error);
      }
    }
  }

  private lookup(language: SupportedLanguage, key: string): TranslationValue | undefined {
    const parts = key.split('.').filter(Boolean);
    let current: TranslationValue | undefined = this.dictionaries()[language];
    for (const part of parts) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return undefined;
      }
      current = current[part];
    }
    return current;
  }

  private warnMissingKey(language: SupportedLanguage, key: string): void {
    if (!isDevMode()) {
      return;
    }
    const marker = `${language}:${key}`;
    if (this.missingKeys.has(marker)) {
      return;
    }
    this.missingKeys.add(marker);
    console.warn(`Missing translation key "${key}" for "${language}".`);
  }
}

function interpolate(value: string, params: TranslationParams | undefined): string {
  if (!params) {
    return value;
  }
  return value.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key: string) => {
    const replacement = params[key];
    return replacement === null || replacement === undefined ? match : String(replacement);
  });
}

function safeLocalStorage(document: Document): Storage | null {
  try {
    return document.defaultView?.localStorage ?? null;
  } catch {
    return null;
  }
}
