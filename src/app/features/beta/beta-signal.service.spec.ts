import { TestBed } from '@angular/core/testing';
import {
  BETA_INTEREST_STORAGE_KEY,
  BETA_SIGNAL_COUNTERS_STORAGE_KEY,
  createEmptyBetaInterestSelection,
  createEmptyBetaSignalCounters
} from './beta-signal.model';
import { BetaSignalService } from './beta-signal.service';

describe('BetaSignalService', () => {
  let service: BetaSignalService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(BetaSignalService);
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('initializes empty local counters for every beta signal', () => {
    expect(service.counters()).toEqual(createEmptyBetaSignalCounters());
    expect(localStorage.getItem(BETA_SIGNAL_COUNTERS_STORAGE_KEY)).toBeNull();
  });

  it('increments beta signal counters in localStorage', () => {
    service.increment('landing_view');
    service.increment('landing_view');
    service.increment('zip_uploaded');
    service.increment('buy_me_a_coffee_clicked');

    expect(service.counters().landing_view).toBe(2);
    expect(service.counters().zip_uploaded).toBe(1);
    expect(service.counters().buy_me_a_coffee_clicked).toBe(1);
    expect(JSON.parse(localStorage.getItem(BETA_SIGNAL_COUNTERS_STORAGE_KEY) ?? '{}')).toMatchObject({
      landing_view: 2,
      zip_uploaded: 1,
      buy_me_a_coffee_clicked: 1
    });
  });

  it('saves and reads interest preferences locally', () => {
    const selection = {
      ...createEmptyBetaInterestSelection(),
      polarToGarminTraining: true,
      betaTesting: true
    };

    const saved = service.saveInterestPreferences(selection);

    expect(saved.polarToGarminTraining).toBe(true);
    expect(saved.betaTesting).toBe(true);
    expect(saved.savedAt).toEqual(expect.any(String));
    expect(service.getInterestPreferences()).toEqual(saved);
    expect(JSON.parse(localStorage.getItem(BETA_INTEREST_STORAGE_KEY) ?? '{}')).toMatchObject({
      polarToGarminTraining: true,
      betaTesting: true
    });
    expect(service.counters().interest_preferences_saved).toBe(1);
  });

  it('ignores corrupted localStorage JSON', () => {
    TestBed.resetTestingModule();
    localStorage.setItem(BETA_SIGNAL_COUNTERS_STORAGE_KEY, '{broken');
    localStorage.setItem(BETA_INTEREST_STORAGE_KEY, '{broken');
    TestBed.configureTestingModule({});

    service = TestBed.inject(BetaSignalService);

    expect(service.counters()).toEqual(createEmptyBetaSignalCounters());
    expect(service.getInterestPreferences()).toBeNull();
  });
});
