export const BETA_INTEREST_STORAGE_KEY = 'json2fit.beta.interestPreferences';
export const BETA_SIGNAL_COUNTERS_STORAGE_KEY = 'json2fit.beta.signalCounters';

export type BetaSignalEvent =
  | 'landing_view'
  | 'upload_started'
  | 'zip_uploaded'
  | 'json_uploaded'
  | 'files_classified'
  | 'tcx_export_clicked'
  | 'fit_export_clicked'
  | 'zip_export_clicked'
  | 'csv_export_clicked'
  | 'buy_me_a_coffee_clicked'
  | 'interest_preferences_saved';

export const BETA_SIGNAL_EVENTS: readonly BetaSignalEvent[] = [
  'landing_view',
  'upload_started',
  'zip_uploaded',
  'json_uploaded',
  'files_classified',
  'tcx_export_clicked',
  'fit_export_clicked',
  'zip_export_clicked',
  'csv_export_clicked',
  'buy_me_a_coffee_clicked',
  'interest_preferences_saved'
];

export type BetaSignalCounters = Record<BetaSignalEvent, number>;

export interface BetaInterestPreferences {
  polarToGarminTraining: boolean;
  polarActivityToGarminCsv: boolean;
  sleepWellnessReports: boolean;
  fullArchiveZipExport: boolean;
  desktopCli: boolean;
  otherPlatforms: boolean;
  betaTesting: boolean;
  savedAt: string;
}

export type BetaInterestSelection = Omit<BetaInterestPreferences, 'savedAt'>;
export type BetaInterestPreferenceKey = keyof BetaInterestSelection;

export interface BetaInterestOption {
  key: BetaInterestPreferenceKey;
  labelKey: string;
}

export const BETA_INTEREST_OPTIONS: readonly BetaInterestOption[] = [
  { key: 'polarToGarminTraining', labelKey: 'beta.options.polarToGarminTraining' },
  { key: 'polarActivityToGarminCsv', labelKey: 'beta.options.polarActivityToGarminCsv' },
  { key: 'sleepWellnessReports', labelKey: 'beta.options.sleepWellnessReports' },
  { key: 'fullArchiveZipExport', labelKey: 'beta.options.fullArchiveZipExport' },
  { key: 'desktopCli', labelKey: 'beta.options.desktopCli' },
  { key: 'otherPlatforms', labelKey: 'beta.options.otherPlatforms' },
  { key: 'betaTesting', labelKey: 'beta.options.betaTesting' }
];

export function createEmptyBetaSignalCounters(): BetaSignalCounters {
  return BETA_SIGNAL_EVENTS.reduce((counters, event) => {
    counters[event] = 0;
    return counters;
  }, {} as BetaSignalCounters);
}

export function createEmptyBetaInterestSelection(): BetaInterestSelection {
  return {
    polarToGarminTraining: false,
    polarActivityToGarminCsv: false,
    sleepWellnessReports: false,
    fullArchiveZipExport: false,
    desktopCli: false,
    otherPlatforms: false,
    betaTesting: false
  };
}
