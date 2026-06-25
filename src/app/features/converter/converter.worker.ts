/// <reference lib="webworker" />

import { ConversionResult, NormalizedActivityResult } from '@shared/models';
import { exportActivityToFit } from './fit-exporter';

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

interface WorkerRequest {
  id: number;
  action: WorkerAction;
  payload?: unknown;
}

interface WorkerResponse {
  id: number;
  ok: boolean;
  payload?: unknown;
  error?: string;
}

interface InitializePayload {
  appBaseUrl?: string;
}

interface PyodideModule {
  loadPyodide: (options: { indexURL: string }) => Promise<any>;
}

interface PyodideAssetCheck {
  filename: string;
  minBytes: number;
  requiredContentType?: string;
}

const PYODIDE_LOAD_TIMEOUT_MS = 60_000;

const CRITICAL_PYODIDE_ASSETS: PyodideAssetCheck[] = [
  { filename: 'pyodide.asm.wasm', minBytes: 1_000_000, requiredContentType: 'application/wasm' },
  { filename: 'pyodide.asm.js', minBytes: 100_000 },
  { filename: 'python_stdlib.zip', minBytes: 100_000 }
];

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

let pyodideReady: Promise<unknown> | null = null;
let pyodideRuntime: any;
let pythonCallQueue: Promise<void> = Promise.resolve();
let nextPythonPayloadId = 1;

addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  handleRequest(event.data).catch((error: unknown) => {
    postMessage({
      id: event.data.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    } satisfies WorkerResponse);
  });
});

async function handleRequest(request: WorkerRequest): Promise<void> {
  if (request.action === 'initialize') {
    await initializePyodide(readInitializePayload(request.payload));
    postOk(request.id, { ready: true });
    return;
  }

  await initializePyodide();
  const payload = JSON.stringify(request.payload ?? {});
  if (request.action === 'classifyFiles') {
    postOk(request.id, JSON.parse(await runPythonJson('classify_files_json', payload)) as unknown);
  } else if (request.action === 'convertToTcx') {
    postOk(request.id, JSON.parse(await runPythonJson('convert_to_tcx_json', payload)) as unknown);
  } else if (request.action === 'convertManyToTcx') {
    postOk(request.id, JSON.parse(await runPythonJson('convert_many_to_tcx_json', payload)) as unknown);
  } else if (request.action === 'convertToFit') {
    postOk(request.id, await convertToFit(request.payload));
  } else if (request.action === 'convertManyToFit') {
    postOk(request.id, await convertManyToFit(request.payload));
  } else if (request.action === 'normalizeActivity') {
    postOk(request.id, JSON.parse(await runPythonJson('normalize_activity_json', payload)) as unknown);
  } else if (request.action === 'analyzeWellnessFiles') {
    postOk(request.id, JSON.parse(await runPythonJson('analyze_wellness_files_json', payload)) as unknown);
  } else {
    postOk(request.id, await convertManyToGarminBundle(request.payload));
  }
}

async function initializePyodide(payload?: InitializePayload): Promise<unknown> {
  pyodideReady ??= (async () => {
    const assetBaseUrl = resolveAssetBaseUrl(payload?.appBaseUrl);
    const pyodideBaseUrl = new URL('assets/pyodide/', assetBaseUrl);
    const wasmMimeFallbackAvailable = installWebAssemblyStreamingFallback();
    await validatePyodideAssets(pyodideBaseUrl, wasmMimeFallbackAvailable);
    const pyodideModule = await importPyodideModule(pyodideBaseUrl);
    try {
      pyodideRuntime = await withTimeout(
        pyodideModule.loadPyodide({ indexURL: pyodideBaseUrl.toString() }),
        PYODIDE_LOAD_TIMEOUT_MS,
        `Pyodide nie zakończyło inicjalizacji przez ${Math.round(PYODIDE_LOAD_TIMEOUT_MS / 1000)} s. Sprawdź, czy hosting poprawnie serwuje assets/pyodide/pyodide.asm.wasm jako application/wasm.`
      );
    } catch (error) {
      throw new Error(`Nie udało się zainicjalizować Pyodide z ${pyodideBaseUrl.toString()}: ${errorMessage(error)}`);
    }
    await pyodideRuntime.runPythonAsync('import sys\nsys.path.insert(0, "/home/pyodide")');
    pyodideRuntime.FS.mkdirTree('/home/pyodide/converter');

    for (const filename of PYTHON_FILES) {
      const moduleUrl = new URL(`assets/python/converter/${filename}`, assetBaseUrl);
      const response = await fetch(moduleUrl);
      if (!response.ok) {
        throw new Error(`Nie udało się załadować modułu Python ${filename} z ${moduleUrl.toString()} (${response.status}).`);
      }
      const source = await response.text();
      if (looksLikeHtml(source)) {
        throw new Error(`Hosting zwrócił HTML zamiast modułu Python ${filename}: ${moduleUrl.toString()}`);
      }
      pyodideRuntime.FS.writeFile(`/home/pyodide/converter/${filename}`, source);
    }

    await pyodideRuntime.runPythonAsync('from converter import main');
    return pyodideRuntime;
  })();
  return pyodideReady;
}

async function validatePyodideAssets(pyodideBaseUrl: URL, wasmMimeFallbackAvailable: boolean): Promise<void> {
  for (const asset of CRITICAL_PYODIDE_ASSETS) {
    const url = new URL(asset.filename, pyodideBaseUrl);
    const response = await fetchAssetHeaders(url);
    try {
      validateAssetResponse(url, response, asset, wasmMimeFallbackAvailable);
    } finally {
      await response.body?.cancel().catch(() => undefined);
    }
  }
}

async function fetchAssetHeaders(url: URL): Promise<Response> {
  let headResponse: Response | null = null;
  try {
    headResponse = await fetch(url, { method: 'HEAD', cache: 'no-store' });
  } catch {
    headResponse = null;
  }

  if (headResponse && headResponse.status !== 405 && headResponse.status !== 403) {
    return headResponse;
  }

  return fetch(url, { cache: 'no-store', headers: { Range: 'bytes=0-0' } });
}

function validateAssetResponse(url: URL, response: Response, asset: PyodideAssetCheck, wasmMimeFallbackAvailable: boolean): void {
  if (!response.ok && response.status !== 206) {
    throw new Error(`Nie udało się pobrać ${asset.filename} z ${url.toString()} (${response.status}).`);
  }

  const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? '';
  if (contentType.includes('text/html')) {
    throw new Error(`Hosting zwrócił HTML zamiast ${asset.filename}: ${url.toString()}`);
  }

  if (asset.requiredContentType && contentType !== asset.requiredContentType && !wasmMimeFallbackAvailable) {
    const receivedType = contentType || 'brak Content-Type';
    throw new Error(
      `Hosting serwuje ${asset.filename} jako "${receivedType}", a Pyodide wymaga "${asset.requiredContentType}". ` +
        'Dla Apache dodaj: AddType application/wasm .wasm, a potem wyczyść stary service worker/cache przeglądarki.'
    );
  }

  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > 0 && contentLength < asset.minBytes) {
    throw new Error(
      `Plik ${asset.filename} z ${url.toString()} wygląda na ucięty (${contentLength} B). Wdróż ponownie pełny katalog assets/pyodide.`
    );
  }
}

function installWebAssemblyStreamingFallback(): boolean {
  const webAssembly = globalThis.WebAssembly;
  const nativeInstantiateStreaming = webAssembly?.instantiateStreaming;
  if (typeof nativeInstantiateStreaming !== 'function') {
    return false;
  }
  const marker = '__json2fitInstantiateStreamingFallback';
  const markedWebAssembly = webAssembly as typeof WebAssembly & Record<string, unknown>;
  if (markedWebAssembly[marker]) {
    return true;
  }

  try {
    markedWebAssembly.instantiateStreaming = async (
      source: Response | PromiseLike<Response>,
      importObject?: WebAssembly.Imports
    ): Promise<WebAssembly.WebAssemblyInstantiatedSource> => {
      const response = await source;
      const fallbackResponse = response.clone();
      try {
        return await nativeInstantiateStreaming.call(webAssembly, response, importObject);
      } catch (error) {
        try {
          return await webAssembly.instantiate(await fallbackResponse.arrayBuffer(), importObject);
        } catch {
          throw error;
        }
      }
    };
    markedWebAssembly[marker] = true;
    return true;
  } catch {
    return false;
  }
}

async function importPyodideModule(pyodideBaseUrl: URL): Promise<PyodideModule> {
  const moduleUrl = new URL('pyodide.mjs', pyodideBaseUrl).toString();
  try {
    const pyodideModule = await import(/* @vite-ignore */ moduleUrl);
    return resolvePyodideModule(pyodideModule, moduleUrl);
  } catch (primaryError) {
    const fallbackUrl = new URL('pyodide.js', pyodideBaseUrl).toString();
    try {
      const pyodideModule = await import(/* @vite-ignore */ fallbackUrl);
      return resolvePyodideModule(pyodideModule, fallbackUrl);
    } catch (fallbackError) {
      throw new Error(
        `Nie udało się załadować Pyodide z ${moduleUrl} ani ${fallbackUrl}: ${errorMessage(primaryError)}; fallback: ${errorMessage(fallbackError)}`
      );
    }
  }
}

function resolvePyodideModule(moduleValue: unknown, moduleUrl: string): PyodideModule {
  const moduleLoadPyodide = (moduleValue as { loadPyodide?: unknown } | null)?.loadPyodide;
  if (typeof moduleLoadPyodide === 'function') {
    return { loadPyodide: moduleLoadPyodide as PyodideModule['loadPyodide'] };
  }
  const globalLoadPyodide = (globalThis as { loadPyodide?: unknown }).loadPyodide;
  if (typeof globalLoadPyodide === 'function') {
    return { loadPyodide: globalLoadPyodide as PyodideModule['loadPyodide'] };
  }
  throw new Error(`Plik Pyodide nie udostępnia loadPyodide: ${moduleUrl}`);
}

function readInitializePayload(value: unknown): InitializePayload | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const appBaseUrl = (value as { appBaseUrl?: unknown }).appBaseUrl;
  return typeof appBaseUrl === 'string' ? { appBaseUrl } : undefined;
}

function resolveAssetBaseUrl(appBaseUrl: string | undefined): URL {
  if (appBaseUrl) {
    try {
      return new URL('./', new URL(appBaseUrl, self.location.href));
    } catch {
      // Fall back to the worker location below.
    }
  }
  return new URL('./', self.location.href);
}

function looksLikeHtml(source: string): boolean {
  return /^\s*<!doctype html/i.test(source) || /^\s*<html[\s>]/i.test(source);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  });
}

async function runPythonJson(functionName: string, payload: string): Promise<string> {
  const queuedCall = pythonCallQueue.then(() => runPythonJsonUnlocked(functionName, payload));
  pythonCallQueue = queuedCall.then(
    () => undefined,
    () => undefined
  );
  return queuedCall;
}

async function runPythonJsonUnlocked(functionName: string, payload: string): Promise<string> {
  const payloadName = `_codex_payload_${nextPythonPayloadId++}`;
  pyodideRuntime.globals.set(payloadName, payload);
  try {
    return await pyodideRuntime.runPythonAsync(
      `from converter.main import ${functionName}\n${functionName}(${payloadName})`
    );
  } finally {
    pyodideRuntime.globals.delete(payloadName);
  }
}

function postOk(id: number, payload: unknown): void {
  postMessage({ id, ok: true, payload } satisfies WorkerResponse);
}

async function convertToFit(payload: unknown): Promise<ConversionResult> {
  const normalized = JSON.parse(
    await runPythonJson('normalize_activity_json', JSON.stringify(payload ?? {}))
  ) as NormalizedActivityResult;
  if (normalized.status !== 'success' || !normalized.activity) {
    return {
      status: 'error',
      format: 'fit',
      filename: normalized.filename.replace(/\.json$/i, '.fit'),
      mimeType: 'application/vnd.ant.fit',
      content: new Uint8Array(),
      warnings: normalized.warnings ?? [],
      errors: normalized.errors?.length ? normalized.errors : ['Nie udało się znormalizować aktywności do FIT.'],
      activity: normalized.activity,
      garminReady: normalized.garminReady
    };
  }
  if (normalized.garminReady?.status === 'error' || normalized.garminReady?.status === 'unsupported') {
    return {
      status: 'error',
      format: 'fit',
      filename: normalized.filename.replace(/\.json$/i, '.fit'),
      mimeType: 'application/vnd.ant.fit',
      content: new Uint8Array(),
      warnings: normalized.garminReady.warnings,
      errors: normalized.garminReady.errors.length
        ? normalized.garminReady.errors
        : ['Aktywność nie przeszła walidacji Garmin-ready dla FIT.'],
      activity: normalized.activity,
      garminReady: normalized.garminReady
    };
  }
  return exportActivityToFit(normalized.activity, normalized.garminReady);
}

async function convertManyToFit(payload: unknown): Promise<ConversionResult[]> {
  const files = Array.isArray(payload) ? payload : [];
  const results: ConversionResult[] = [];
  for (const file of files) {
    results.push(await convertToFit(file));
  }
  return results;
}

async function convertManyToGarminBundle(payload: unknown): Promise<ConversionResult[]> {
  const files = Array.isArray(payload) ? payload : [];
  const tcxResults = JSON.parse(await runPythonJson('convert_many_to_tcx_json', JSON.stringify(files))) as ConversionResult[];
  const fitResults = await convertManyToFit(files);
  return [...tcxResults, ...fitResults];
}
