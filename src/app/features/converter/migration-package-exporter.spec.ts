import JSZip from 'jszip';
import {
  ActivitySummary,
  ConversionResult,
  GarminReadyReportItem,
  PolarFileClassification,
  WellnessReport
} from '@shared/models';
import {
  createMigrationPackage,
  DEFAULT_MIGRATION_EXPORT_OPTIONS,
  safeActivityFilename
} from './migration-package-exporter';

describe('migration package exporter', () => {
  it('puts TCX files under activities/tcx', async () => {
    const zip = await loadPackage([
      resultFixture({ format: 'tcx', filename: 'source.tcx', content: '<TrainingCenterDatabase />' })
    ]);

    expect(filePaths(zip).some((path) => path.startsWith('activities/tcx/'))).toBe(true);
    expect(zip.file('activities/tcx/2024-05-02_06-30_running_polar-123.tcx')).toBeTruthy();
  });

  it('puts FIT files under activities/fit', async () => {
    const zip = await loadPackage([
      resultFixture({ format: 'fit', filename: 'source.fit', content: new Uint8Array([1, 2, 3]) })
    ]);

    expect(filePaths(zip).some((path) => path.startsWith('activities/fit/'))).toBe(true);
    expect(zip.file('activities/fit/2024-05-02_06-30_running_polar-123.fit')).toBeTruthy();
  });

  it('creates safe UTC filenames', () => {
    const filename = safeActivityFilename(
      resultFixture({
        format: 'tcx',
        activity: activityFixture({
          activityId: 'A/B:12',
          sport: 'Bieganie / Łódź?',
          sportDetail: null,
          startTime: '2024-05-02T08:30:00+02:00'
        })
      }),
      'tcx'
    );

    expect(filename).toBe('2024-05-02_06-30_bieganie-lodz_polar-a-b-12.tcx');
  });

  it('deduplicates conflicting names with numeric suffixes', async () => {
    const zip = await loadPackage([
      resultFixture({ format: 'tcx' }),
      resultFixture({ format: 'tcx' })
    ]);

    expect(zip.file('activities/tcx/2024-05-02_06-30_running_polar-123.tcx')).toBeTruthy();
    expect(zip.file('activities/tcx/2024-05-02_06-30_running_polar-123_2.tcx')).toBeTruthy();
  });

  it('includes CSV reports', async () => {
    const zip = await loadPackage([resultFixture({ format: 'tcx' })]);

    expect(zip.file('reports/import-summary.csv')).toBeTruthy();
    expect(zip.file('reports/file-classification-report.csv')).toBeTruthy();
    expect(zip.file('reports/garmin-ready-report.csv')).toBeTruthy();
    expect(zip.file('reports/garmin-ready-report.json')).toBeTruthy();
    expect(zip.file('reports/warnings.csv')).toBeTruthy();
    expect(zip.file('reports/skipped-files.csv')).toBeTruthy();
  });

  it('reports conversion errors without dropping successful activities', async () => {
    const zip = await loadPackage([
      resultFixture({ format: 'tcx' }),
      resultFixture({
        status: 'error',
        format: 'tcx',
        filename: 'broken.tcx',
        content: '',
        errors: ['parser failed'],
        activity: activityFixture({ sourceFilename: 'broken.json', activityId: 'broken' })
      })
    ]);

    expect(zip.file('activities/tcx/2024-05-02_06-30_running_polar-123.tcx')).toBeTruthy();
    const skipped = await zip.file('reports/skipped-files.csv')?.async('string');
    expect(skipped).toContain('broken.json');
    expect(skipped).toContain('parser failed');
  });

  it('includes real wellness reports instead of the old NOT_AVAILABLE placeholder', async () => {
    const zip = await loadPackage(
      [],
      {
        includeTcx: false,
        includeFit: false,
        includeReports: false,
        includeWellnessReports: true,
        includeReadme: false
      },
      wellnessReportFixture()
    );

    const dailyActivity = await zip.file('wellness/daily-activity.csv')?.async('string');
    expect(dailyActivity).toContain('date,steps,calories,active_time_minutes');
    expect(dailyActivity).toContain('2024-05-04,12000,2200,85');
    expect(zip.file('wellness/wellness-normalized.json')).toBeTruthy();
    expect(zip.file('wellness/wellness-report.html')).toBeTruthy();
    expect(zip.file('wellness/NOT_AVAILABLE.txt')).toBeNull();
  });

  it('omits empty wellness CSV reports while keeping JSON and HTML', async () => {
    const zip = await loadPackage([], {
      includeTcx: false,
      includeFit: false,
      includeReports: false,
      includeWellnessReports: true,
      includeReadme: false
    });

    expect(zip.file('wellness/daily-activity.csv')).toBeNull();
    expect(zip.file('wellness/wellness-normalized.json')).toBeTruthy();
    expect(zip.file('wellness/wellness-report.html')).toBeTruthy();
  });
});

async function loadPackage(
  results: ConversionResult[],
  options = DEFAULT_MIGRATION_EXPORT_OPTIONS,
  wellnessReport: WellnessReport | null = null
): Promise<JSZip> {
  const migrationPackage = await createMigrationPackage({
    options,
    classificationReport: [classificationFixture()],
    garminReadyReport: [garminReadyFixture()],
    conversionResults: results,
    wellnessReport,
    importedFiles: [],
    fileIssues: [],
    createdAt: new Date('2024-05-03T10:15:00Z'),
    sourceZipFilename: 'polar-export.zip'
  });
  return JSZip.loadAsync(migrationPackage.blob);
}

function garminReadyFixture(overrides: Partial<GarminReadyReportItem> = {}): GarminReadyReportItem {
  return {
    path: 'training-session-123.json',
    filename: 'training-session-123.json',
    sourceFileKind: 'training_session',
    activityId: 'polar-123',
    sport: 'Running',
    sportDetail: null,
    startTime: '2024-05-02T06:30:00Z',
    status: 'ready',
    message: 'Gotowe do importu Garmin Connect',
    possibleFormats: ['tcx', 'fit'],
    hasGps: true,
    hasHeartRate: true,
    trackpointCount: 2,
    warnings: [],
    errors: [],
    formatValidations: [],
    ...overrides
  };
}

function filePaths(zip: JSZip): string[] {
  return Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => entry.name);
}

function resultFixture(overrides: Partial<ConversionResult> = {}): ConversionResult {
  const format = overrides.format ?? 'tcx';
  return {
    status: 'success',
    format,
    filename: `activity.${format}`,
    mimeType: format === 'tcx' ? 'application/vnd.garmin.tcx+xml' : 'application/vnd.ant.fit',
    content: format === 'tcx' ? '<TrainingCenterDatabase />' : new Uint8Array([1, 2, 3]),
    warnings: [],
    errors: [],
    activity: activityFixture(),
    ...overrides
  };
}

function activityFixture(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    sourceFilename: 'training-session-123.json',
    sourceFileKind: 'training_session',
    activityId: 'polar-123',
    sport: 'Running',
    sportDetail: null,
    startTime: '2024-05-02T06:30:00Z',
    durationSeconds: 600,
    distanceMeters: 1500,
    calories: 100,
    trackpointCount: 2,
    hasGps: true,
    hasHeartRate: true,
    hasCadence: false,
    hasPower: false,
    ...overrides
  };
}

function classificationFixture(overrides: Partial<PolarFileClassification> = {}): PolarFileClassification {
  return {
    path: 'training-session-123.json',
    filename: 'training-session-123.json',
    sizeBytes: 128,
    category: 'training_session',
    confidence: 'high',
    reason: 'ready',
    warnings: [],
    detectedKeys: ['sport'],
    ...overrides
  };
}

function wellnessReportFixture(): WellnessReport {
  return {
    dailyActivity: [
      {
        date: '2024-05-04',
        steps: 12000,
        calories: 2200,
        activeTimeMinutes: 85,
        distanceMeters: null,
        sourceFiles: ['activity.json'],
        warnings: []
      }
    ],
    sleepSummaries: [],
    sleepStages: [],
    nightlyRecharge: [],
    dailyHeartRate: [],
    undatedRecords: [],
    skippedRecords: [],
    warnings: [],
    summary: {
      dailyActivityDays: 1,
      sleepNights: 0,
      sleepStageRecords: 0,
      nightlyRechargeDays: 0,
      dailyHeartRateDays: 0,
      dateStart: '2024-05-04',
      dateEnd: '2024-05-04',
      averageSleepScore: null,
      averageSleepDurationMinutes: null,
      warningCount: 0
    }
  };
}
