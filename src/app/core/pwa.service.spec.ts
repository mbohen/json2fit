import { TestBed } from '@angular/core/testing';
import { PwaService } from './pwa.service';

describe('PwaService', () => {
  let restoreBaseHref: (() => void) | null = null;
  let restoreServiceWorker: (() => void) | null = null;

  afterEach(() => {
    restoreBaseHref?.();
    restoreBaseHref = null;
    restoreServiceWorker?.();
    restoreServiceWorker = null;
    TestBed.resetTestingModule();
  });

  it('registers and caches app assets relative to the configured base href', async () => {
    const appBaseUrl = new URL('/tools/json2fit/', window.location.origin);
    restoreBaseHref = setBaseHref(appBaseUrl.pathname);

    const postMessage = vi.fn((message: { type: string; urls: string[] }, ports?: readonly Transferable[]) => {
      const responsePort = ports?.[0] as MessagePort | undefined;
      responsePort?.postMessage({ type: 'CACHE_URLS_DONE', cached: message.urls.length, errors: [] });
    });
    const worker = { postMessage } as unknown as ServiceWorker;
    const registration = { active: worker } as ServiceWorkerRegistration;
    const serviceWorker = {
      controller: null,
      ready: Promise.resolve(registration),
      register: vi.fn(async () => registration)
    } as unknown as ServiceWorkerContainer;
    restoreServiceWorker = mockServiceWorker(serviceWorker);

    TestBed.configureTestingModule({});
    const service = TestBed.inject(PwaService);

    await service.registerServiceWorker();
    await service.prepareOfflineCache();

    expect(serviceWorker.register).toHaveBeenCalledWith(new URL('sw.js', appBaseUrl).toString());

    const cacheMessage = postMessage.mock.calls.at(-1)?.[0];
    expect(cacheMessage?.type).toBe('CACHE_URLS');
    expect(cacheMessage?.urls).toContain(new URL('assets/pyodide/pyodide.mjs', appBaseUrl).toString());
    expect(cacheMessage?.urls).toContain(new URL('assets/pyodide/pyodide.js', appBaseUrl).toString());
    expect(cacheMessage?.urls).toContain(new URL('assets/python/converter/main.py', appBaseUrl).toString());
    expect(cacheMessage?.urls).not.toContain(new URL('/assets/pyodide/pyodide.mjs', window.location.origin).toString());
    expect(cacheMessage?.urls.every((url) => new URL(url).pathname.startsWith('/tools/json2fit/'))).toBe(true);
  });
});

function setBaseHref(href: string): () => void {
  const existingBase = document.querySelector('base');
  const base = existingBase ?? document.head.appendChild(document.createElement('base'));
  const previousHref = base.getAttribute('href');
  base.setAttribute('href', href);

  return () => {
    if (!existingBase) {
      base.remove();
    } else if (previousHref === null) {
      base.removeAttribute('href');
    } else {
      base.setAttribute('href', previousHref);
    }
  };
}

function mockServiceWorker(serviceWorker: ServiceWorkerContainer): () => void {
  const previousDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: serviceWorker
  });

  return () => {
    if (previousDescriptor) {
      Object.defineProperty(navigator, 'serviceWorker', previousDescriptor);
    } else {
      Reflect.deleteProperty(navigator, 'serviceWorker');
    }
  };
}
