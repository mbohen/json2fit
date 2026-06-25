export interface WellnessSummary {
  dailyActivityDays: number;
  sleepNights: number;
  sleepStageRecords: number;
  nightlyRechargeDays: number;
  dailyHeartRateDays: number;
  dateStart: string | null;
  dateEnd: string | null;
  averageSleepScore: number | null;
  averageSleepDurationMinutes: number | null;
  warningCount: number;
}

export interface DailyActivitySummary {
  date: string | null;
  steps?: number | null;
  calories?: number | null;
  activeTimeMinutes?: number | null;
  distanceMeters?: number | null;
  sourceFiles: string[];
  warnings: string[];
}

export interface SleepSummary {
  date: string | null;
  sleepStart?: string | null;
  sleepEnd?: string | null;
  durationMinutes?: number | null;
  actualSleepMinutes?: number | null;
  sleepScore?: number | null;
  continuityScore?: number | null;
  deepSleepMinutes?: number | null;
  lightSleepMinutes?: number | null;
  remSleepMinutes?: number | null;
  interruptionsMinutes?: number | null;
  avgHeartRate?: number | null;
  avgHrv?: number | null;
  breathingRate?: number | null;
  sourceFiles: string[];
  warnings: string[];
}

export interface SleepStageRecord {
  date: string | null;
  stage: string;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number | null;
  sourceFile: string;
  warnings: string[];
}

export interface NightlyRechargeSummary {
  date: string | null;
  rechargeStatus?: string | null;
  ansStatus?: string | null;
  ansCharge?: number | null;
  hrvMs?: number | null;
  avgHrv?: number | null;
  breathingRate?: number | null;
  restingHeartRate?: number | null;
  sourceFiles: string[];
  warnings: string[];
}

export interface DailyHeartRateSummary {
  date: string | null;
  averageHeartRate?: number | null;
  restingHeartRate?: number | null;
  minHeartRate?: number | null;
  maxHeartRate?: number | null;
  sourceFiles: string[];
  warnings: string[];
}

export interface WellnessUndatedRecord {
  recordType: string;
  date: string | null;
  sourceFiles?: string[];
  sourceFile?: string;
  warnings: string[];
  [key: string]: unknown;
}

export interface WellnessSkippedRecord {
  recordType: string;
  sourceFile: string;
  warnings: string[];
}

export interface WellnessReport {
  dailyActivity: DailyActivitySummary[];
  sleepSummaries: SleepSummary[];
  sleepStages: SleepStageRecord[];
  nightlyRecharge: NightlyRechargeSummary[];
  dailyHeartRate: DailyHeartRateSummary[];
  undatedRecords: WellnessUndatedRecord[];
  skippedRecords: WellnessSkippedRecord[];
  warnings: string[];
  summary: WellnessSummary;
}
