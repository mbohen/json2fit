import { Injectable, inject, signal } from '@angular/core';
import { I18nService } from '@app/core/i18n/i18n.service';
import {
  ConversionResult,
  InputFile,
  NormalizedActivityResult,
  PolarFileClassificationResult,
  WellnessReport
} from '@shared/models';
import { translateWorkerMessage } from './worker-message-i18n';

type WorkerAction =
  | 'initialize'
  | 'classifyFiles'
  | 'convertToTcx'
  | 'convertManyToTcx'
  | 'convertToFit'
  | 'convertManyToFit'
  | 'convertManyToGarminBundle'
  | 'normalizeActivity'
  | 'analyzeWellnessFiles';
type RuntimeStatus = 'idle' | 'loading' | 'ready' | 'error';

interface WorkerRequest {
  id: number;
  action: WorkerAction;
  payload?: unknown;
}

interface WorkerResponse<T = unknown> {
  id: number;
  ok: boolean;
  payload?: T;
  error?: string;
}

interface InitializePayload {
  appBaseUrl: string;
}

const DEFAULT_WORKER_REQUEST_TIMEOUT_MS = 120_000;
const LONG_WORKER_REQUEST_TIMEOUT_MS = 300_000;

@Injectable({ providedIn: 'root' })
export class PyodideConverterService {
  readonly status = signal<RuntimeStatus>('idle');
  readonly error = signal<string | null>(null);

  private readonly i18n = inject(I18nService);
  private worker: Worker | null = null;
  private nextId = 1;
  private initializePromise: Promise<void> | null = null;
  private readonly pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
      timeoutId: ReturnType<typeof setTimeout>;
    }
  >();

  initialize(): Promise<void> {
    this.initializePromise ??= this.request('initialize', { appBaseUrl: appBaseUrl() } satisfies InitializePayload).then(() => {
      this.status.set('ready');
      this.error.set(null);
    });
    if (this.status() !== 'ready') {
      this.status.set('loading');
    }
    return this.initializePromise.catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.status.set('error');
      this.error.set(message);
      this.initializePromise = null;
      throw error;
    });
  }

  async classifyFiles(input: InputFile[]): Promise<PolarFileClassificationResult[]> {
    await this.initialize();
    return this.request<PolarFileClassificationResult[]>('classifyFiles', input);
  }

  async convertToTcx(input: { filename: string; jsonText: string }): Promise<ConversionResult> {
    await this.initialize();
    return this.request<ConversionResult>('convertToTcx', input);
  }

  async convertManyToTcx(files: InputFile[]): Promise<ConversionResult[]> {
    await this.initialize();
    return this.request<ConversionResult[]>('convertManyToTcx', files);
  }

  async convertToFit(input: { filename: string; jsonText: string }): Promise<ConversionResult> {
    await this.initialize();
    return this.request<ConversionResult>('convertToFit', input);
  }

  async convertManyToFit(files: InputFile[]): Promise<ConversionResult[]> {
    await this.initialize();
    return this.request<ConversionResult[]>('convertManyToFit', files);
  }

  async convertManyToGarminBundle(files: InputFile[]): Promise<ConversionResult[]> {
    await this.initialize();
    return this.request<ConversionResult[]>('convertManyToGarminBundle', files);
  }

  async normalizeActivity(file: InputFile): Promise<NormalizedActivityResult> {
    await this.initialize();
    return this.request<NormalizedActivityResult>('normalizeActivity', file);
  }

  async analyzeWellnessFiles(files: InputFile[]): Promise<WellnessReport> {
    await this.initialize();
    return this.request<WellnessReport>('analyzeWellnessFiles', files);
  }

  private request<T = unknown>(action: WorkerAction, payload?: unknown): Promise<T> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    const message: WorkerRequest = { id, action, payload };
    const timeoutMs = workerRequestTimeoutMs(action);

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (!this.pending.has(id)) {
          return;
        }
        this.failWorker(workerTimeoutMessage(action, timeoutMs, this.i18n));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value: unknown) => resolve(value as T),
        reject,
        timeoutId
      });
      try {
        worker.postMessage(message);
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timeoutId);
        reject(new Error(postMessageError(action, error, this.i18n)));
      }
    });
  }

  private ensureWorker(): Worker {
    if (typeof Worker === 'undefined') {
      throw new Error(this.i18n.t('converter.runtime.noWorkerSupport'));
    }
    if (this.worker) {
      return this.worker;
    }

    this.worker = new Worker(new URL('./converter.worker', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const pending = this.pending.get(event.data.id);
      if (!pending) {
        return;
      }
      this.pending.delete(event.data.id);
      clearTimeout(pending.timeoutId);
      if (event.data.ok) {
        pending.resolve(event.data.payload);
      } else {
        pending.reject(new Error(event.data.error ? translateWorkerMessage(event.data.error, this.i18n) : this.i18n.t('converter.runtime.unknownConversionError')));
      }
    };
    this.worker.onerror = (event) => {
      this.failWorker(event.message || this.i18n.t('converter.runtime.workerEnded'));
    };
    this.worker.onmessageerror = () => {
      this.failWorker(this.i18n.t('converter.runtime.workerMessageError'));
    };
    return this.worker;
  }

  private failWorker(message: string): void {
    const error = new Error(message);
    this.status.set('error');
    this.error.set(error.message);
    this.initializePromise = null;

    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(error);
    }
    this.pending.clear();

    const worker = this.worker;
    this.worker = null;
    worker?.terminate();
  }
}

function workerRequestTimeoutMs(action: WorkerAction): number {
  switch (action) {
    case 'convertManyToTcx':
    case 'convertManyToFit':
    case 'convertManyToGarminBundle':
      return LONG_WORKER_REQUEST_TIMEOUT_MS;
    default:
      return DEFAULT_WORKER_REQUEST_TIMEOUT_MS;
  }
}

function workerTimeoutMessage(action: WorkerAction, timeoutMs: number, i18n: I18nService): string {
  return i18n.t('converter.runtime.workerTimeout', {
    seconds: Math.round(timeoutMs / 1000),
    action: workerActionLabel(action, i18n)
  });
}

function workerActionLabel(action: WorkerAction, i18n: I18nService): string {
  return i18n.t(`converter.runtime.actions.${action}`);
}

function appBaseUrl(): string {
  if (typeof document === 'undefined') {
    return './';
  }
  return new URL('./', document.baseURI).toString();
}

function postMessageError(action: WorkerAction, error: unknown, i18n: I18nService): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.toLowerCase().includes('out of memory') || message.toLowerCase().includes('cannot be cloned')) {
    return i18n.t('converter.runtime.postMessageTooLarge', { action });
  }
  return message;
}
