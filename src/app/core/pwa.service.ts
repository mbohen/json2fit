import { Injectable, inject, signal } from '@angular/core';
import { I18nService } from './i18n/i18n.service';

const PYTHON_FILES = [
  '__init__.py',
  'models.py',
  'sport_mapping.py',
  'errors.py',
  'schema_detector.py',
  'polar_file_classifier.py',
  'polar_parser.py',
  'wellness_parser.py',
  'tcx_exporter.py',
  'fit_exporter.py',
  'validation.py',
  'main.py'
];

const PYODIDE_ASSETS = [
  'pyodide.mjs',
  'pyodide.js',
  'pyodide.asm.js',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json'
];

const HELP_FILES = [
  'download-polar-export.md',
  'import-files.md',
  'tcx-vs-fit.md',
  'import-to-garmin.md',
  'troubleshooting.md',
  'sleep-and-wellness.md',
  'privacy.md'
];

const CORE_OFFLINE_PATHS = [
  '',
  'index.html',
  'favicon.svg',
  'favicon.ico',
  'manifest.webmanifest',
  'assets/icons/json2fit-icon.svg',
  ...PYTHON_FILES.map((filename) => `assets/python/converter/${filename}`),
  ...PYODIDE_ASSETS.map((filename) => `assets/pyodide/${filename}`),
  ...HELP_FILES.map((filename) => `assets/help/pl/${filename}`),
  ...HELP_FILES.map((filename) => `assets/help/en/${filename}`)
];

interface BeforeInstallPromptEvent extends Event {
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

interface CacheUrlsResponse {
  type: 'CACHE_URLS_DONE';
  cached: number;
  errors: string[];
}

@Injectable({ providedIn: 'root' })
export class PwaService {
  readonly online = signal(true);
  readonly serviceWorkerReady = signal(false);
  readonly offlineCacheReady = signal(false);
  readonly installPromptAvailable = signal(false);
  readonly error = signal<string | null>(null);

  private registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;
  private installPrompt: BeforeInstallPromptEvent | null = null;
  private readonly i18n = inject(I18nService);

  constructor() {
    if (!isBrowser()) {
      return;
    }

    this.online.set(navigator.onLine);
    window.addEventListener('online', () => this.online.set(true));
    window.addEventListener('offline', () => this.online.set(false));
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.installPrompt = event as BeforeInstallPromptEvent;
      this.installPromptAvailable.set(true);
    });
  }

  async registerServiceWorker(): Promise<void> {
    if (!isBrowser() || !('serviceWorker' in navigator)) {
      this.error.set(this.i18n.t('converter.pwa.noServiceWorker'));
      return;
    }

    this.registrationPromise ??= navigator.serviceWorker
      .register(resolveAppUrl('sw.js'))
      .then(async (registration) => {
        await navigator.serviceWorker.ready;
        this.serviceWorkerReady.set(true);
        this.error.set(null);
        void this.prepareOfflineCache();
        return registration;
      })
      .catch((error: unknown) => {
        this.serviceWorkerReady.set(false);
        this.error.set(this.i18n.t('converter.pwa.registerFailed', { error: errorMessage(error) }));
        return null;
      });

    await this.registrationPromise;
  }

  async prepareOfflineCache(): Promise<void> {
    if (!isBrowser() || !('serviceWorker' in navigator)) {
      return;
    }

    const registration = await this.registrationPromise;
    const worker = registration?.active ?? registration?.waiting ?? registration?.installing ?? navigator.serviceWorker.controller;
    if (!worker) {
      this.error.set(this.i18n.t('converter.pwa.offlineNotReady'));
      return;
    }

    try {
      await sendCacheUrlsMessage(worker, collectOfflineUrls(), this.i18n);
      this.offlineCacheReady.set(true);
      this.error.set(null);
    } catch (error) {
      this.offlineCacheReady.set(false);
      this.error.set(this.i18n.t('converter.pwa.prepareFailed', { error: errorMessage(error) }));
    }
  }

  async promptInstall(): Promise<boolean> {
    if (!this.installPrompt) {
      return false;
    }

    const prompt = this.installPrompt;
    this.installPrompt = null;
    this.installPromptAvailable.set(false);
    await prompt.prompt();
    const choice = await prompt.userChoice.catch(() => ({ outcome: 'dismissed' as const, platform: '' }));
    return choice.outcome === 'accepted';
  }

  markOfflineCacheCleared(): void {
    this.offlineCacheReady.set(false);
  }
}

function collectOfflineUrls(): string[] {
  const urls = new Set(CORE_OFFLINE_PATHS.map(resolveAppUrl));

  document.querySelectorAll<HTMLScriptElement>('script[src]').forEach((script) => urls.add(script.src));
  document
    .querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href], link[rel="modulepreload"][href]')
    .forEach((link) => urls.add(link.href));

  for (const entry of performance.getEntriesByType('resource')) {
    const resource = entry as PerformanceResourceTiming;
    if (isOfflineResourceUrl(resource.name)) {
      urls.add(resource.name);
    }
  }

  return [...urls].filter(isOfflineResourceUrl);
}

function isOfflineResourceUrl(value: string): boolean {
  try {
    const baseUrl = appBaseUrl();
    const url = new URL(value, baseUrl);
    return url.origin === baseUrl.origin && url.protocol !== 'blob:' && url.pathname.startsWith(appBasePath());
  } catch {
    return false;
  }
}

function resolveAppUrl(path: string): string {
  return new URL(path, appBaseUrl()).toString();
}

function appBaseUrl(): URL {
  return new URL(document.baseURI);
}

function appBasePath(): string {
  const path = appBaseUrl().pathname;
  return path.endsWith('/') ? path : `${path}/`;
}

function sendCacheUrlsMessage(worker: ServiceWorker, urls: string[], i18n: I18nService): Promise<CacheUrlsResponse> {
  if (typeof MessageChannel === 'undefined') {
    return Promise.reject(new Error(i18n.t('converter.pwa.messageChannelUnavailable')));
  }

  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => {
      channel.port1.close();
      reject(new Error(i18n.t('converter.pwa.cacheNoResponse')));
    }, 15000);

    channel.port1.onmessage = (event: MessageEvent<CacheUrlsResponse>) => {
      window.clearTimeout(timeout);
      channel.port1.close();
      resolve(event.data);
    };

    worker.postMessage({ type: 'CACHE_URLS', urls }, [channel.port2]);
  });
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
