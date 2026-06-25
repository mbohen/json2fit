import { Injectable, inject } from '@angular/core';
import { I18nService } from './i18n/i18n.service';

const APP_CACHE_PREFIX = 'json2fit-';
const APP_INDEXED_DB_NAMES = ['json2fit', 'json2fit-offline-cache'];
const APP_INDEXED_DB_PREFIXES = ['json2fit'];

export interface ClearAppDataOptions {
  includeOfflineCache: boolean;
}

export interface ClearAppDataResult {
  localStorageCleared: boolean;
  sessionStorageCleared: boolean;
  indexedDbDeleted: string[];
  cachesDeleted: string[];
  errors: string[];
}

@Injectable({ providedIn: 'root' })
export class AppDataService {
  private readonly i18n = inject(I18nService);

  async clearAppData(options: ClearAppDataOptions): Promise<ClearAppDataResult> {
    const result: ClearAppDataResult = {
      localStorageCleared: false,
      sessionStorageCleared: false,
      indexedDbDeleted: [],
      cachesDeleted: [],
      errors: []
    };

    clearStorage('localStorage', result);
    clearStorage('sessionStorage', result);
    await deleteAppIndexedDbs(result, this.i18n);
    if (options.includeOfflineCache) {
      await deleteAppCaches(result);
    }

    return result;
  }
}

function clearStorage(kind: 'localStorage' | 'sessionStorage', result: ClearAppDataResult): void {
  if (!isBrowser()) {
    return;
  }

  try {
    window[kind].clear();
    if (kind === 'localStorage') {
      result.localStorageCleared = true;
    } else {
      result.sessionStorageCleared = true;
    }
  } catch (error) {
    result.errors.push(`${kind}: ${errorMessage(error)}`);
  }
}

async function deleteAppIndexedDbs(result: ClearAppDataResult, i18n: I18nService): Promise<void> {
  if (!isBrowser() || !('indexedDB' in window)) {
    return;
  }

  const names = await listAppIndexedDbNames(result);
  for (const name of names) {
    try {
      await deleteIndexedDb(name, i18n);
      result.indexedDbDeleted.push(name);
    } catch (error) {
      result.errors.push(`IndexedDB ${name}: ${errorMessage(error)}`);
    }
  }
}

async function listAppIndexedDbNames(result: ClearAppDataResult): Promise<string[]> {
  const names = new Set(APP_INDEXED_DB_NAMES);
  const factory = window.indexedDB;

  if (typeof factory.databases === 'function') {
    try {
      const databases = await factory.databases();
      for (const database of databases) {
        if (database.name && isAppIndexedDbName(database.name)) {
          names.add(database.name);
        }
      }
    } catch (error) {
      result.errors.push(`IndexedDB list: ${errorMessage(error)}`);
    }
  }

  return [...names].filter(isAppIndexedDbName);
}

function deleteIndexedDb(name: string, i18n: I18nService): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(i18n.t('converter.appData.deleteDatabaseFailed')));
    request.onblocked = () => reject(new Error(i18n.t('converter.appData.deleteDatabaseBlocked')));
  });
}

async function deleteAppCaches(result: ClearAppDataResult): Promise<void> {
  if (!isBrowser() || !('caches' in window)) {
    return;
  }

  try {
    const cacheNames = await window.caches.keys();
    for (const cacheName of cacheNames.filter((name) => name.startsWith(APP_CACHE_PREFIX))) {
      const deleted = await window.caches.delete(cacheName);
      if (deleted) {
        result.cachesDeleted.push(cacheName);
      }
    }
  } catch (error) {
    result.errors.push(`Cache Storage: ${errorMessage(error)}`);
  }
}

function isAppIndexedDbName(name: string): boolean {
  return APP_INDEXED_DB_PREFIXES.some((prefix) => name === prefix || name.startsWith(`${prefix}-`));
}

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
