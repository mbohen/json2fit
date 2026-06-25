import { TestBed } from '@angular/core/testing';
import { I18nService } from './i18n.service';
import { LANGUAGE_STORAGE_KEY } from './i18n.model';

describe('I18nService', () => {
  const originalLanguage = Object.getOwnPropertyDescriptor(window.navigator, 'language');

  beforeEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    mockFetch();
    setNavigatorLanguage('en-US');
  });

  afterEach(() => {
    if (originalLanguage) {
      Object.defineProperty(window.navigator, 'language', originalLanguage);
    }
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('uses the saved language before browser detection', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'pl');

    const i18n = TestBed.inject(I18nService);

    expect(i18n.currentLanguage()).toBe('pl');
    expect(i18n.locale()).toBe('pl-PL');
    expect(document.documentElement.lang).toBe('pl');
    expect(i18n.t('landing.primaryCta')).toBe('Wgraj eksport Polar Flow');
  });

  it('detects Polish browser language and otherwise falls back to English', () => {
    setNavigatorLanguage('pl-PL');
    let i18n = TestBed.inject(I18nService);

    expect(i18n.currentLanguage()).toBe('pl');

    TestBed.resetTestingModule();
    localStorage.clear();
    mockFetch();
    setNavigatorLanguage('de-DE');
    i18n = TestBed.inject(I18nService);

    expect(i18n.currentLanguage()).toBe('en');
    expect(i18n.locale()).toBe('en-US');
    expect(document.documentElement.lang).toBe('en');
  });

  it('persists language changes and falls back to English or the key', async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'pl');
    const i18n = TestBed.inject(I18nService);

    await i18n.setLanguage('en');

    expect(i18n.currentLanguage()).toBe('en');
    expect(i18n.locale()).toBe('en-US');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    expect(i18n.t('landing.primaryCta')).toBe('Upload Polar Flow export');
    expect(i18n.t('missing.translation.key')).toBe('missing.translation.key');
  });
});

function setNavigatorLanguage(language: string): void {
  Object.defineProperty(window.navigator, 'language', {
    configurable: true,
    value: language
  });
}

function mockFetch(): void {
  Object.defineProperty(window, 'fetch', {
    configurable: true,
    value: vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({})
    }))
  });
}
