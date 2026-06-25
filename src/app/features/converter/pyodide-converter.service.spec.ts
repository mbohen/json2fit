import { TestBed } from '@angular/core/testing';
import { PyodideConverterService } from './pyodide-converter.service';

describe('PyodideConverterService', () => {
  let restoreBaseHref: (() => void) | null = null;

  beforeEach(() => {
    localStorage.setItem('json2fit.language', 'pl');
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
  });

  afterEach(() => {
    restoreBaseHref?.();
    restoreBaseHref = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('passes the app base URL to the worker during initialization', async () => {
    const appBaseUrl = new URL('/tools/json2fit/', window.location.origin);
    restoreBaseHref = setBaseHref(appBaseUrl.pathname);
    const service = TestBed.inject(PyodideConverterService);

    const initializePromise = service.initialize();
    const worker = FakeWorker.instances[0];
    const message = worker.messages[0] as { id: number; action: string; payload: { appBaseUrl: string } };

    expect(message.action).toBe('initialize');
    expect(message.payload.appBaseUrl).toBe(appBaseUrl.toString());

    worker.emitMessage({ id: message.id, ok: true, payload: { ready: true } });
    await initializePromise;

    expect(service.status()).toBe('ready');
    expect(service.error()).toBeNull();
  });

  it('rejects pending initialization when the worker errors', async () => {
    const service = TestBed.inject(PyodideConverterService);

    const initializePromise = service.initialize();
    const worker = FakeWorker.instances[0];
    worker.emitError('Pyodide failed to load');

    await expect(initializePromise).rejects.toThrow('Pyodide failed to load');
    expect(service.status()).toBe('error');
    expect(service.error()).toBe('Pyodide failed to load');
    expect(worker.terminated).toBe(true);
  });

  it('creates a fresh worker on retry after an error', async () => {
    const service = TestBed.inject(PyodideConverterService);

    const firstInitialize = service.initialize();
    const firstWorker = FakeWorker.instances[0];
    firstWorker.emitError('Worker crashed');
    await expect(firstInitialize).rejects.toThrow('Worker crashed');

    const secondInitialize = service.initialize();
    const secondWorker = FakeWorker.instances[1];
    const message = secondWorker.messages[0] as { id: number };
    secondWorker.emitMessage({ id: message.id, ok: true, payload: { ready: true } });
    await secondInitialize;

    expect(secondWorker).not.toBe(firstWorker);
    expect(service.status()).toBe('ready');
  });

  it('rejects pending initialization when the worker does not answer', async () => {
    vi.useFakeTimers();
    const service = TestBed.inject(PyodideConverterService);

    const initializePromise = service.initialize();
    const worker = FakeWorker.instances[0];
    const rejection = expect(initializePromise).rejects.toThrow('Worker konwersji nie odpowiedział przez 120 s');

    vi.advanceTimersByTime(120_000);

    await rejection;
    expect(service.status()).toBe('error');
    expect(service.error()).toContain('uruchamiania Pyodide');
    expect(worker.terminated).toBe(true);
  });
});

class FakeWorker {
  static instances: FakeWorker[] = [];

  readonly messages: unknown[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emitMessage(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  emitError(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

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
