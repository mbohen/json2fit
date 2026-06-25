import { GarminReadyReportItem, NormalizedActivity } from '@shared/models';
import {
  createGarminDiagnosticReport,
  diagnosticReportToText,
  diagnoseGarminIssues
} from './garmin-diagnostics';

describe('garmin diagnostics', () => {
  it('diagnoses missing start_time with a concrete suggestion', () => {
    const issues = diagnoseGarminIssues(
      garminReadyFixture({
        status: 'error',
        startTime: null,
        message: 'Brak start_time.',
        possibleFormats: [],
        errors: ['Brak start_time.']
      })
    );

    expect(issues.map((issue) => issue.code)).toContain('missing-start-time');
    expect(issues.find((issue) => issue.code === 'missing-start-time')?.suggestion).toContain('źródłowy JSON');
  });

  it('diagnoses invalid GPS coordinates', () => {
    const issues = diagnoseGarminIssues(
      garminReadyFixture({
        status: 'error',
        possibleFormats: [],
        errors: ['Nieprawidłowa szerokość geograficzna w trackpoint 1: 120.']
      })
    );

    expect(issues.map((issue) => issue.code)).toContain('invalid-gps');
    expect(issues.find((issue) => issue.code === 'invalid-gps')?.suggestion).toContain('GPS zaokrąglonym');
  });

  it('keeps full coordinates out of the default text report', () => {
    const report = createGarminDiagnosticReport({
      validation: garminReadyFixture(),
      activity: activityFixture()
    });
    const text = diagnosticReportToText(report);

    expect(report.gpsMode).toBe('none');
    expect(report.gpsPoints).toEqual([]);
    expect(text).not.toContain('0.001');
    expect(text).not.toContain('0.001');
  });

  it('rounds GPS unless full coordinates are explicitly requested', () => {
    const rounded = createGarminDiagnosticReport({
      validation: garminReadyFixture(),
      activity: activityFixture(),
      gpsMode: 'rounded'
    });
    const full = createGarminDiagnosticReport({
      validation: garminReadyFixture(),
      activity: activityFixture(),
      gpsMode: 'full'
    });

    expect(rounded.gpsPoints[0]).toEqual({
      time: '2024-05-02T06:30:00Z',
      latitude: 0.001,
      longitude: 0.001
    });
    expect(full.gpsPoints[0]).toEqual({
      time: '2024-05-02T06:30:00Z',
      latitude: 0.001,
      longitude: 0.001
    });
  });

  it('links suggestions to validation errors', () => {
    const report = createGarminDiagnosticReport({
      validation: garminReadyFixture({
        status: 'error',
        possibleFormats: [],
        errors: ['Brak trackpointów.', 'Duplikaty timestampów trackpointów.']
      })
    });

    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['missing-trackpoints', 'duplicate-timestamps'])
    );
  });

  it('uses Polish sport names in the visible diagnostic sport mapping', () => {
    const report = createGarminDiagnosticReport({
      validation: garminReadyFixture({
        sport: 'Other',
        sportDetail: 'Pool swimming'
      })
    });
    const text = diagnosticReportToText(report);

    expect(report.sportMapping).toBe('Pływanie w basenie');
    expect(text).toContain('Sport mapping: Pływanie w basenie');
    expect(text).not.toContain('Pool swimming');
  });
});

function garminReadyFixture(overrides: Partial<GarminReadyReportItem> = {}): GarminReadyReportItem {
  return {
    path: 'training-session-123.json',
    filename: 'training-session-123.json',
    sourceFileKind: 'training_session',
    activityId: '123',
    sport: 'Running',
    sportDetail: 'Running',
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

function activityFixture(): NormalizedActivity {
  return {
    source: 'Polar Flow',
    sourceFilename: 'training-session-123.json',
    sourceFileKind: 'training_session',
    activityId: '123',
    sport: 'Running',
    sportDetail: 'Running',
    startTime: '2024-05-02T06:30:00Z',
    durationSeconds: 600,
    distanceMeters: 1200,
    calories: null,
    trackpointCount: 2,
    hasGps: true,
    hasHeartRate: true,
    hasCadence: false,
    hasPower: false,
    averageHeartRate: 140,
    maxHeartRate: 155,
    trackpoints: [
      {
        time: '2024-05-02T06:30:00Z',
        latitude: 0.001,
        longitude: 0.001,
        altitudeMeters: 100,
        distanceMeters: 0,
        heartRate: 130,
        cadence: null,
        speedMps: null,
        powerWatts: null,
        temperatureCelsius: null
      },
      {
        time: '2024-05-02T06:40:00Z',
        latitude: 0.003,
        longitude: 0.003,
        altitudeMeters: 108,
        distanceMeters: 1200,
        heartRate: 155,
        cadence: null,
        speedMps: null,
        powerWatts: null,
        temperatureCelsius: null
      }
    ],
    laps: [],
    metadata: {}
  };
}
