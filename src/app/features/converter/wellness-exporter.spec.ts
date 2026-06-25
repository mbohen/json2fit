import JSZip from 'jszip';
import { WellnessReport } from '@shared/models';
import {
  createWellnessPackage,
  dailyActivityToCsv,
  emptyWellnessReport,
  mergeWellnessReports,
  sleepSummaryToCsv
} from './wellness-exporter';

describe('wellness exporter', () => {
  it('generates CSV, normalized JSON and local HTML report', async () => {
    const wellnessPackage = await createWellnessPackage(wellnessReportFixture(), new Date('2024-05-07T10:00:00Z'));
    const zip = await JSZip.loadAsync(wellnessPackage.blob);

    expect(wellnessPackage.filename).toBe('polar-wellness-export-2024-05-07_10-00.zip');
    expect(zip.file('wellness/daily-activity.csv')).toBeTruthy();
    expect(zip.file('wellness/sleep-summary.csv')).toBeTruthy();
    expect(zip.file('wellness/sleep-stages.csv')).toBeTruthy();
    expect(zip.file('wellness/nightly-recharge.csv')).toBeTruthy();
    expect(zip.file('wellness/daily-heart-rate.csv')).toBeTruthy();
    expect(zip.file('wellness/wellness-normalized.json')).toBeTruthy();
    expect(zip.file('wellness/wellness-report.html')).toBeTruthy();
    expect(zip.file('wellness/NOT_AVAILABLE.txt')).toBeNull();

    const html = await zip.file('wellness/wellness-report.html')?.async('string');
    expect(html).toContain('Garmin Connect does not provide a stable public import for Polar Flow sleep history');
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain('<script');
  });

  it('omits empty CSV files but keeps JSON and HTML report', async () => {
    const wellnessPackage = await createWellnessPackage(emptyWellnessReport());
    const zip = await JSZip.loadAsync(wellnessPackage.blob);

    expect(zip.file('wellness/daily-activity.csv')).toBeNull();
    expect(zip.file('wellness/sleep-summary.csv')).toBeNull();
    expect(zip.file('wellness/wellness-normalized.json')).toBeTruthy();
    expect(zip.file('wellness/wellness-report.html')).toBeTruthy();
  });

  it('uses stable CSV headers and empty fields instead of fake zeroes', () => {
    const csv = sleepSummaryToCsv([
      {
        date: '2024-05-05',
        sleepStart: '2024-05-04T22:00:00Z',
        sleepEnd: '2024-05-05T06:00:00Z',
        durationMinutes: 480,
        actualSleepMinutes: null,
        sleepScore: null,
        sourceFiles: ['sleep.json'],
        warnings: []
      }
    ]);

    expect(csv.split('\n')[0]).toBe(
      'date,sleep_start,sleep_end,duration_minutes,actual_sleep_minutes,sleep_score,continuity_score,deep_sleep_minutes,light_sleep_minutes,rem_sleep_minutes,interruptions_minutes,avg_heart_rate,avg_hrv,breathing_rate,source_files,warnings'
    );
    expect(csv).toContain('2024-05-05,2024-05-04T22:00:00Z,2024-05-05T06:00:00Z,480,,,');
    expect(csv).not.toContain(',0,');
  });

  it('merges same-day records with first value winning and warnings', () => {
    const merged = mergeWellnessReports([
      {
        ...emptyWellnessReport(),
        dailyActivity: [
          {
            date: '2024-05-04',
            steps: 1000,
            sourceFiles: ['a.json'],
            warnings: []
          }
        ]
      },
      {
        ...emptyWellnessReport(),
        dailyActivity: [
          {
            date: '2024-05-04',
            steps: 1500,
            calories: 2000,
            sourceFiles: ['b.json'],
            warnings: []
          }
        ]
      }
    ]);

    expect(merged.dailyActivity).toHaveLength(1);
    expect(merged.dailyActivity[0].steps).toBe(1000);
    expect(merged.dailyActivity[0].calories).toBe(2000);
    expect(merged.dailyActivity[0].sourceFiles).toEqual(['a.json', 'b.json']);
    expect(merged.dailyActivity[0].warnings[0]).toContain('Konflikt pola steps');
  });

  it('escapes CSV source filenames and warnings', () => {
    const csv = dailyActivityToCsv([
      {
        date: '2024-05-04',
        steps: 1200,
        sourceFiles: ['folder/activity, quoted.json'],
        warnings: ['warning, one']
      }
    ]);

    expect(csv).toContain('"folder/activity, quoted.json"');
    expect(csv).toContain('"warning, one"');
  });
});

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
    sleepSummaries: [
      {
        date: '2024-05-05',
        sleepStart: '2024-05-04T22:00:00Z',
        sleepEnd: '2024-05-05T06:00:00Z',
        durationMinutes: 480,
        sleepScore: 82,
        sourceFiles: ['sleep.json'],
        warnings: []
      }
    ],
    sleepStages: [
      {
        date: '2024-05-04',
        stage: 'deep',
        startTime: '2024-05-04T23:00:00Z',
        endTime: '2024-05-04T23:45:00Z',
        durationMinutes: 45,
        sourceFile: 'sleep.json',
        warnings: []
      }
    ],
    nightlyRecharge: [
      {
        date: '2024-05-05',
        rechargeStatus: 'good',
        ansCharge: 3.1,
        hrvMs: 62,
        sourceFiles: ['nightly.json'],
        warnings: []
      }
    ],
    dailyHeartRate: [
      {
        date: '2024-05-05',
        averageHeartRate: 60,
        restingHeartRate: 48,
        minHeartRate: 50,
        maxHeartRate: 70,
        sourceFiles: ['ohr.json'],
        warnings: []
      }
    ],
    undatedRecords: [],
    skippedRecords: [],
    warnings: [],
    summary: {
      dailyActivityDays: 1,
      sleepNights: 1,
      sleepStageRecords: 1,
      nightlyRechargeDays: 1,
      dailyHeartRateDays: 1,
      dateStart: '2024-05-04',
      dateEnd: '2024-05-05',
      averageSleepScore: 82,
      averageSleepDurationMinutes: 480,
      warningCount: 0
    }
  };
}
