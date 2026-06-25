import { TestBed } from '@angular/core/testing';
import { AppDataService } from './app-data.service';

describe('AppDataService', () => {
  let service: AppDataService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AppDataService);
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('clears local and session storage and app IndexedDB names', async () => {
    localStorage.setItem('json2fit-test', 'training-data');
    sessionStorage.setItem('json2fit-session', 'preview-data');
    const indexedDb = createIndexedDbMock(['json2fit-preview', 'json2fit-state', 'unrelated-db']);
    vi.stubGlobal('indexedDB', indexedDb);

    const result = await service.clearAppData({ includeOfflineCache: false });

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(result.localStorageCleared).toBe(true);
    expect(result.sessionStorageCleared).toBe(true);
    expect(indexedDb.deleteDatabase).toHaveBeenCalledWith('json2fit-preview');
    expect(indexedDb.deleteDatabase).toHaveBeenCalledWith('json2fit-state');
    expect(indexedDb.deleteDatabase).not.toHaveBeenCalledWith('unrelated-db');
  });

  it('deletes only json2fit Cache Storage entries during full cleanup', async () => {
    const deletedCaches: string[] = [];
    vi.stubGlobal('caches', {
      keys: vi.fn(async () => ['json2fit-static-v1', 'json2fit-runtime-v1', 'other-cache']),
      delete: vi.fn(async (name: string) => {
        deletedCaches.push(name);
        return true;
      })
    });
    vi.stubGlobal('indexedDB', createIndexedDbMock([]));

    const result = await service.clearAppData({ includeOfflineCache: true });

    expect(deletedCaches).toEqual(['json2fit-static-v1', 'json2fit-runtime-v1']);
    expect(result.cachesDeleted).toEqual(['json2fit-static-v1', 'json2fit-runtime-v1']);
  });

  it('keeps offline cache when full cleanup is not requested', async () => {
    const caches = {
      keys: vi.fn(async () => ['json2fit-static-v1']),
      delete: vi.fn(async () => true)
    };
    vi.stubGlobal('caches', caches);
    vi.stubGlobal('indexedDB', createIndexedDbMock([]));

    await service.clearAppData({ includeOfflineCache: false });

    expect(caches.keys).not.toHaveBeenCalled();
    expect(caches.delete).not.toHaveBeenCalled();
  });
});

function createIndexedDbMock(databaseNames: string[]) {
  return {
    databases: vi.fn(async () => databaseNames.map((name) => ({ name }))),
    deleteDatabase: vi.fn((name: string) => {
      const request = {
        error: null,
        onblocked: null,
        onerror: null,
        onsuccess: null
      } as unknown as IDBOpenDBRequest;
      window.setTimeout(() => request.onsuccess?.call(request, new Event('success')));
      return request as IDBOpenDBRequest;
    })
  };
}
