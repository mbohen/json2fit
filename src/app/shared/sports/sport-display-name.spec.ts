import { TestBed } from '@angular/core/testing';
import { LANGUAGE_STORAGE_KEY } from '@app/core/i18n/i18n.model';
import { I18nService } from '@app/core/i18n/i18n.service';
import { displayActivitySportName, displaySportNamePl, normalizeSportKey } from './sport-display-name';
import { SportDisplayNameService } from './sport-display-name';

describe('sport display name', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('normalizes common Polar sport variants', () => {
    expect(normalizeSportKey('Pool swimming')).toBe('pool_swimming');
    expect(normalizeSportKey('POOL_SWIMMING')).toBe('pool_swimming');
    expect(normalizeSportKey('pool-swimming')).toBe('pool_swimming');
    expect(normalizeSportKey('  Fitness   martial arts  ')).toBe('fitness_martial_arts');
    expect(normalizeSportKey('Jazda na rowerze górskim')).toBe('jazda_na_rowerze_górskim');
  });

  it('maps known sports to Polish display names', () => {
    expect(displaySportNamePl('Pool swimming')).toBe('Pływanie w basenie');
    expect(displaySportNamePl('POOL_SWIMMING')).toBe('Pływanie w basenie');
    expect(displaySportNamePl('pool-swimming')).toBe('Pływanie w basenie');
    expect(displaySportNamePl('Fitness martial arts')).toBe('Sporty walki fitness');
    expect(displaySportNamePl('Kickboxing martial arts')).toBe('Kickboxing');
    expect(displaySportNamePl('Walking')).toBe('Chodzenie');
    expect(displaySportNamePl('mountain_biking')).toBe('Jazda na rowerze górskim');
    expect(displaySportNamePl('Jazda na rowerze górskim')).toBe('Jazda na rowerze górskim');
  });

  it('uses a Polish fallback for unknown technical or English names', () => {
    expect(displaySportNamePl('unknown_sport')).toBe('Inna aktywność');
    expect(displaySportNamePl('Morning Run')).toBe('Inna aktywność');
  });

  it('falls back from unknown sport detail to the technical sport category', () => {
    expect(displayActivitySportName({ sport: 'Running', sportDetail: 'Morning Run' })).toBe('Bieganie');
    expect(displayActivitySportName({ sport: 'Other', sportDetail: 'Pool swimming' })).toBe('Pływanie w basenie');
  });

  it('uses the runtime language in SportDisplayNameService', async () => {
    localStorage.clear();
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'pl');
    mockFetch();
    TestBed.resetTestingModule();

    const service = TestBed.inject(SportDisplayNameService);

    expect(normalizeSportKey('Pool swimming')).toBe('pool_swimming');
    expect(service.displaySportName('Walking')).toBe('Chodzenie');
    expect(service.displaySportName('unknown_sport')).toBe('Inna aktywność');

    await TestBed.inject(I18nService).setLanguage('en');

    expect(service.displaySportName('Walking')).toBe('Walking');
    expect(service.displaySportName('unknown_sport')).toBe('Other activity');
  });
});

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
