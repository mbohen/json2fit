import { beforeEach, vi } from 'vitest';
import enTranslations from './assets/i18n/en.json';
import plTranslations from './assets/i18n/pl.json';

beforeEach(() => {
  Object.defineProperty(window.navigator, 'language', {
    configurable: true,
    value: 'pl-PL'
  });
  Object.defineProperty(window, 'fetch', {
    configurable: true,
    value: vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return {
        ok: true,
        status: 200,
        json: async () => (url.includes('/pl.json') ? plTranslations : enTranslations)
      };
    })
  });
});
