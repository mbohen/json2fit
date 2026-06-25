import { Injectable, signal } from '@angular/core';
import {
  BETA_INTEREST_STORAGE_KEY,
  BETA_SIGNAL_COUNTERS_STORAGE_KEY,
  BetaInterestPreferences,
  BetaInterestSelection,
  BetaSignalCounters,
  BetaSignalEvent,
  BETA_SIGNAL_EVENTS,
  createEmptyBetaInterestSelection,
  createEmptyBetaSignalCounters
} from './beta-signal.model';

@Injectable({ providedIn: 'root' })
export class BetaSignalService {
  readonly counters = signal<BetaSignalCounters>(this.loadCounters());
  readonly interestPreferences = signal<BetaInterestPreferences | null>(this.loadInterestPreferences());

  increment(event: BetaSignalEvent): BetaSignalCounters {
    const next = {
      ...this.counters(),
      [event]: this.counters()[event] + 1
    };
    this.counters.set(next);
    this.writeJson(BETA_SIGNAL_COUNTERS_STORAGE_KEY, next);
    return next;
  }

  saveInterestPreferences(selection: BetaInterestSelection): BetaInterestPreferences {
    const preferences: BetaInterestPreferences = {
      ...createEmptyBetaInterestSelection(),
      ...selection,
      savedAt: new Date().toISOString()
    };
    this.interestPreferences.set(preferences);
    this.writeJson(BETA_INTEREST_STORAGE_KEY, preferences);
    this.increment('interest_preferences_saved');
    return preferences;
  }

  getInterestPreferences(): BetaInterestPreferences | null {
    return this.interestPreferences();
  }

  private loadCounters(): BetaSignalCounters {
    const counters = createEmptyBetaSignalCounters();
    const stored = this.readJson(BETA_SIGNAL_COUNTERS_STORAGE_KEY);
    if (!isRecord(stored)) {
      return counters;
    }

    for (const event of BETA_SIGNAL_EVENTS) {
      const value = stored[event];
      counters[event] = typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
    }
    return counters;
  }

  private loadInterestPreferences(): BetaInterestPreferences | null {
    const stored = this.readJson(BETA_INTEREST_STORAGE_KEY);
    if (!isRecord(stored) || typeof stored['savedAt'] !== 'string') {
      return null;
    }

    return {
      ...createEmptyBetaInterestSelection(),
      polarToGarminTraining: stored['polarToGarminTraining'] === true,
      polarActivityToGarminCsv: stored['polarActivityToGarminCsv'] === true,
      sleepWellnessReports: stored['sleepWellnessReports'] === true,
      fullArchiveZipExport: stored['fullArchiveZipExport'] === true,
      desktopCli: stored['desktopCli'] === true,
      otherPlatforms: stored['otherPlatforms'] === true,
      betaTesting: stored['betaTesting'] === true,
      savedAt: stored['savedAt']
    };
  }

  private readJson(key: string): unknown {
    if (!isBrowser()) {
      return null;
    }

    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private writeJson(key: string, value: unknown): void {
    if (!isBrowser()) {
      return;
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Local beta signals are best-effort only.
    }
  }
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
