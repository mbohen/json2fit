const STATIC_CACHE = 'json2fit-static-v3';
const RUNTIME_CACHE = 'json2fit-runtime-v3';
const CACHE_PREFIX = 'json2fit-';

const APP_SCOPE_URL = new URL(self.registration.scope);
const APP_SCOPE_PATH = normalizeScopePath(APP_SCOPE_URL.pathname);
const INDEX_URL = appUrl('index.html');
const SHELL_URL = appUrl('');

const APP_SHELL_URLS = ['', 'index.html', 'favicon.svg', 'favicon.ico', 'manifest.webmanifest', 'assets/icons/json2fit-icon.svg'].map(appUrl);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && !isCurrentCache(key)).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'CACHE_URLS') {
    event.waitUntil(cacheUrls(data.urls || [], event.ports && event.ports[0]));
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (!shouldCacheRequest(request)) {
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(INDEX_URL, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(INDEX_URL)) || caches.match(SHELL_URL);
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response.ok && shouldCacheResponse(response)) {
    const cache = await caches.open(cacheNameForRequest(request));
    await cache.put(request, response.clone());
  }
  return response;
}

async function cacheUrls(urls, responsePort) {
  const cache = await caches.open(RUNTIME_CACHE);
  const uniqueUrls = [...new Set(urls)].filter((url) => shouldCacheUrl(url));
  let cached = 0;
  const errors = [];

  await Promise.all(
    uniqueUrls.map(async (url) => {
      try {
        const request = new Request(url, { method: 'GET' });
        const response = await fetch(request);
        if (!response.ok || !shouldCacheResponse(response)) {
          return;
        }
        await cache.put(request, response.clone());
        cached += 1;
      } catch (error) {
        errors.push(String(error));
      }
    })
  );

  if (responsePort) {
    responsePort.postMessage({ type: 'CACHE_URLS_DONE', cached, errors });
  }
}

function shouldCacheRequest(request) {
  if (request.method !== 'GET') {
    return false;
  }
  return shouldCacheUrl(request.url);
}

function shouldCacheUrl(value) {
  let url;
  try {
    url = new URL(value, APP_SCOPE_URL);
  } catch {
    return false;
  }

  if (url.origin !== APP_SCOPE_URL.origin || url.protocol === 'blob:') {
    return false;
  }

  const path = relativeAppPath(url);
  if (path === null) {
    return false;
  }

  if (path === '' || path === 'index.html' || path === 'manifest.webmanifest' || path === 'favicon.svg' || path === 'favicon.ico') {
    return true;
  }
  if (path.startsWith('assets/icons/') && (path.endsWith('.svg') || path.endsWith('.png'))) {
    return true;
  }
  if (path.startsWith('assets/python/converter/') && path.endsWith('.py')) {
    return true;
  }
  if (path.startsWith('assets/help/pl/') && path.endsWith('.md')) {
    return true;
  }
  if (path.startsWith('assets/pyodide/')) {
    return isAllowedPyodideAsset(path);
  }
  if (isBuildAsset(path)) {
    return true;
  }

  return false;
}

function shouldCacheResponse(response) {
  const type = response.headers.get('content-type') || '';
  return !type.includes('application/vnd.garmin') && !type.includes('application/zip');
}

function isAllowedPyodideAsset(path) {
  return (
    path.endsWith('.mjs') ||
    path.endsWith('.js') ||
    path.endsWith('.wasm') ||
    path.endsWith('.zip') ||
    path.endsWith('pyodide-lock.json')
  );
}

function isBuildAsset(path) {
  return /^[A-Za-z0-9._-]+\.(js|css)$/.test(path);
}

function cacheNameForRequest(request) {
  const path = relativeAppPath(new URL(request.url));
  return path === '' || path === 'index.html' ? STATIC_CACHE : RUNTIME_CACHE;
}

function isCurrentCache(key) {
  return key === STATIC_CACHE || key === RUNTIME_CACHE;
}

function appUrl(path) {
  return new URL(path, APP_SCOPE_URL).toString();
}

function relativeAppPath(url) {
  if (url.origin !== APP_SCOPE_URL.origin || url.protocol === 'blob:') {
    return null;
  }

  if (url.pathname === APP_SCOPE_PATH.slice(0, -1)) {
    return '';
  }

  if (!url.pathname.startsWith(APP_SCOPE_PATH)) {
    return null;
  }

  return url.pathname.slice(APP_SCOPE_PATH.length);
}

function normalizeScopePath(path) {
  return path.endsWith('/') ? path : `${path}/`;
}
