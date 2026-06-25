import JSZip from 'jszip';
import { I18nService } from '@app/core/i18n/i18n.service';
import {
  DailyActivitySummary,
  DailyHeartRateSummary,
  NightlyRechargeSummary,
  SleepSummary,
  SleepStageRecord,
  WellnessReport,
  WellnessSummary
} from '@shared/models';

export interface WellnessPackage {
  filename: string;
  blob: Blob;
  entries: string[];
}

type MergeableWellnessRecord = {
  date: string | null;
  sourceFiles: string[];
  warnings: string[];
};

const EMPTY_SUMMARY: WellnessSummary = {
  dailyActivityDays: 0,
  sleepNights: 0,
  sleepStageRecords: 0,
  nightlyRechargeDays: 0,
  dailyHeartRateDays: 0,
  dateStart: null,
  dateEnd: null,
  averageSleepScore: null,
  averageSleepDurationMinutes: null,
  warningCount: 0
};

export function emptyWellnessReport(): WellnessReport {
  return {
    dailyActivity: [],
    sleepSummaries: [],
    sleepStages: [],
    nightlyRecharge: [],
    dailyHeartRate: [],
    undatedRecords: [],
    skippedRecords: [],
    warnings: [],
    summary: { ...EMPTY_SUMMARY }
  };
}

export function wellnessReportHasData(report: WellnessReport | null | undefined): boolean {
  if (!report) {
    return false;
  }
  return Boolean(
    report.dailyActivity.length ||
      report.sleepSummaries.length ||
      report.sleepStages.length ||
      report.nightlyRecharge.length ||
      report.dailyHeartRate.length ||
      report.undatedRecords.length
  );
}

export async function createWellnessPackage(report: WellnessReport, createdAt = new Date(), i18n?: I18nService): Promise<WellnessPackage> {
  const zip = new JSZip();
  const entries: string[] = [];
  addWellnessReports(zip, entries, report, i18n);
  return {
    filename: `polar-wellness-export-${utcDateMinute(createdAt)}.zip`,
    blob: await zip.generateAsync({ type: 'blob' }),
    entries
  };
}

export function addWellnessReports(zip: JSZip, entries: string[], report: WellnessReport | null | undefined, i18n?: I18nService): void {
  const normalized = normalizeWellnessReport(report);
  const dailyActivity = normalized.dailyActivity.filter(hasDate);
  const sleepSummaries = normalized.sleepSummaries.filter(hasDate);
  const sleepStages = normalized.sleepStages.filter(hasDate);
  const nightlyRecharge = normalized.nightlyRecharge.filter(hasDate);
  const dailyHeartRate = normalized.dailyHeartRate.filter(hasDate);

  if (dailyActivity.length) {
    addText(zip, entries, 'wellness/daily-activity.csv', dailyActivityToCsv(dailyActivity));
  }
  if (sleepSummaries.length) {
    addText(zip, entries, 'wellness/sleep-summary.csv', sleepSummaryToCsv(sleepSummaries));
  }
  if (sleepStages.length) {
    addText(zip, entries, 'wellness/sleep-stages.csv', sleepStagesToCsv(sleepStages));
  }
  if (nightlyRecharge.length) {
    addText(zip, entries, 'wellness/nightly-recharge.csv', nightlyRechargeToCsv(nightlyRecharge));
  }
  if (dailyHeartRate.length) {
    addText(zip, entries, 'wellness/daily-heart-rate.csv', dailyHeartRateToCsv(dailyHeartRate));
  }

  addText(zip, entries, 'wellness/wellness-normalized.json', JSON.stringify(normalized, null, 2));
  addText(zip, entries, 'wellness/wellness-report.html', wellnessReportToHtml(normalized, i18n));
}

export function mergeWellnessReports(reports: WellnessReport[]): WellnessReport {
  if (!reports.length) {
    return emptyWellnessReport();
  }

  const merged = emptyWellnessReport();
  for (const report of reports) {
    mergeCollection(merged.dailyActivity, report.dailyActivity);
    merged.sleepStages.push(...report.sleepStages);
    mergeCollection(merged.sleepSummaries, report.sleepSummaries);
    mergeCollection(merged.nightlyRecharge, report.nightlyRecharge);
    mergeCollection(merged.dailyHeartRate, report.dailyHeartRate);
    merged.undatedRecords.push(...report.undatedRecords);
    merged.skippedRecords.push(...report.skippedRecords);
    merged.warnings.push(...report.warnings);
  }

  return normalizeWellnessReport(merged);
}

export function dailyActivityToCsv(rows: DailyActivitySummary[]): string {
  return csvRows(
    ['date', 'steps', 'calories', 'active_time_minutes', 'distance_meters', 'source_files', 'warnings'],
    rows.map((row) => [
      row.date,
      row.steps,
      row.calories,
      row.activeTimeMinutes,
      row.distanceMeters,
      row.sourceFiles.join('; '),
      row.warnings.join('; ')
    ])
  );
}

export function sleepSummaryToCsv(rows: SleepSummary[]): string {
  return csvRows(
    [
      'date',
      'sleep_start',
      'sleep_end',
      'duration_minutes',
      'actual_sleep_minutes',
      'sleep_score',
      'continuity_score',
      'deep_sleep_minutes',
      'light_sleep_minutes',
      'rem_sleep_minutes',
      'interruptions_minutes',
      'avg_heart_rate',
      'avg_hrv',
      'breathing_rate',
      'source_files',
      'warnings'
    ],
    rows.map((row) => [
      row.date,
      row.sleepStart,
      row.sleepEnd,
      row.durationMinutes,
      row.actualSleepMinutes,
      row.sleepScore,
      row.continuityScore,
      row.deepSleepMinutes,
      row.lightSleepMinutes,
      row.remSleepMinutes,
      row.interruptionsMinutes,
      row.avgHeartRate,
      row.avgHrv,
      row.breathingRate,
      row.sourceFiles.join('; '),
      row.warnings.join('; ')
    ])
  );
}

export function sleepStagesToCsv(rows: SleepStageRecord[]): string {
  return csvRows(
    ['date', 'stage', 'start_time', 'end_time', 'duration_minutes', 'source_file', 'warnings'],
    rows.map((row) => [
      row.date,
      row.stage,
      row.startTime,
      row.endTime,
      row.durationMinutes,
      row.sourceFile,
      row.warnings.join('; ')
    ])
  );
}

export function nightlyRechargeToCsv(rows: NightlyRechargeSummary[]): string {
  return csvRows(
    [
      'date',
      'recharge_status',
      'ans_status',
      'ans_charge',
      'hrv_ms',
      'avg_hrv',
      'breathing_rate',
      'resting_heart_rate',
      'source_files',
      'warnings'
    ],
    rows.map((row) => [
      row.date,
      row.rechargeStatus,
      row.ansStatus,
      row.ansCharge,
      row.hrvMs,
      row.avgHrv,
      row.breathingRate,
      row.restingHeartRate,
      row.sourceFiles.join('; '),
      row.warnings.join('; ')
    ])
  );
}

export function dailyHeartRateToCsv(rows: DailyHeartRateSummary[]): string {
  return csvRows(
    [
      'date',
      'average_heart_rate',
      'resting_heart_rate',
      'min_heart_rate',
      'max_heart_rate',
      'source_files',
      'warnings'
    ],
    rows.map((row) => [
      row.date,
      row.averageHeartRate,
      row.restingHeartRate,
      row.minHeartRate,
      row.maxHeartRate,
      row.sourceFiles.join('; '),
      row.warnings.join('; ')
    ])
  );
}

export function wellnessReportToHtml(report: WellnessReport, i18n?: I18nService): string {
  const normalized = normalizeWellnessReport(report);
  const title = reportText(i18n, 'reports.wellness.title', 'Polar wellness report');
  const missingRows = missingDataRows(normalized);
  const warnings = unique([
    ...normalized.warnings,
    ...normalized.dailyActivity.flatMap((row) => row.warnings),
    ...normalized.sleepSummaries.flatMap((row) => row.warnings),
    ...normalized.sleepStages.flatMap((row) => row.warnings),
    ...normalized.nightlyRecharge.flatMap((row) => row.warnings),
    ...normalized.dailyHeartRate.flatMap((row) => row.warnings),
    ...normalized.undatedRecords.flatMap((row) => row.warnings)
  ]);

  return `<!doctype html>
<html lang="${i18n?.currentLanguage() ?? 'en'}">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Inter, Arial, sans-serif; margin: 32px; color: #1f2933; background: #fff; }
    h1, h2 { margin: 0 0 12px; }
    section { margin-top: 28px; }
    table { border-collapse: collapse; width: 100%; margin-top: 12px; }
    th, td { border: 1px solid #d8dee4; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f4f6f8; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .metric { border: 1px solid #d8dee4; border-radius: 6px; padding: 12px; }
    .value { display: block; font-size: 24px; font-weight: 700; margin-top: 4px; }
    .note { color: #59636e; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="note">${escapeHtml(reportText(i18n, 'reports.wellness.note', 'Report generated locally in the browser. Garmin Connect does not provide a stable public import for Polar Flow sleep history.'))}</p>
  <section class="grid">
    ${metric(reportText(i18n, 'reports.wellness.dailyActivityDays', 'Daily activity days'), normalized.summary.dailyActivityDays)}
    ${metric(reportText(i18n, 'reports.wellness.sleepNights', 'Sleep nights'), normalized.summary.sleepNights)}
    ${metric('Nightly Recharge', normalized.summary.nightlyRechargeDays)}
    ${metric(reportText(i18n, 'reports.wellness.dailyHeartRateDays', 'Daily heart-rate days'), normalized.summary.dailyHeartRateDays)}
    ${metric(reportText(i18n, 'reports.wellness.dateRange', 'Date range'), dateRange(normalized.summary))}
    ${metric(reportText(i18n, 'reports.wellness.averageSleepScore', 'Average sleep score'), displayValue(normalized.summary.averageSleepScore))}
    ${metric(reportText(i18n, 'reports.wellness.averageSleepDuration', 'Average sleep duration'), minutesValue(normalized.summary.averageSleepDurationMinutes))}
  </section>
  <section>
    <h2>${escapeHtml(reportText(i18n, 'reports.wellness.missingData', 'Missing data'))}</h2>
    ${
      missingRows.length
        ? table(
            [
              reportText(i18n, 'reports.wellness.reportColumn', 'Report'),
              reportText(i18n, 'reports.wellness.fieldColumn', 'Field'),
              reportText(i18n, 'reports.wellness.missingCountColumn', 'Missing count')
            ],
            missingRows.map((row) => [row.report, row.field, String(row.count)])
          )
        : `<p class="note">${escapeHtml(reportText(i18n, 'reports.wellness.noMissingData', 'No significant missing data in generated records.'))}</p>`
    }
  </section>
  <section>
    <h2>${escapeHtml(reportText(i18n, 'common.warnings', 'Warnings'))}</h2>
    ${
      warnings.length
        ? `<ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>`
        : `<p class="note">${escapeHtml(reportText(i18n, 'reports.wellness.noWarnings', 'No warnings.'))}</p>`
    }
  </section>
</body>
</html>`;
}

function reportText(i18n: I18nService | undefined, key: string, fallback: string): string {
  if (!i18n) {
    return fallback;
  }
  const translated = i18n.t(key);
  return translated === key ? fallback : translated;
}

function normalizeWellnessReport(report: WellnessReport | null | undefined): WellnessReport {
  const normalized = report ?? emptyWellnessReport();
  normalized.dailyActivity = sortDatedCollection(normalized.dailyActivity);
  normalized.sleepSummaries = sortDatedCollection(normalized.sleepSummaries);
  normalized.sleepStages = [...normalized.sleepStages].sort((a, b) =>
    `${a.date ?? ''}${a.startTime ?? ''}`.localeCompare(`${b.date ?? ''}${b.startTime ?? ''}`)
  );
  normalized.nightlyRecharge = sortDatedCollection(normalized.nightlyRecharge);
  normalized.dailyHeartRate = sortDatedCollection(normalized.dailyHeartRate);
  normalized.warnings = unique([
    ...normalized.warnings,
    ...normalized.dailyActivity.flatMap((row) => row.warnings),
    ...normalized.sleepSummaries.flatMap((row) => row.warnings),
    ...normalized.sleepStages.flatMap((row) => row.warnings),
    ...normalized.nightlyRecharge.flatMap((row) => row.warnings),
    ...normalized.dailyHeartRate.flatMap((row) => row.warnings),
    ...normalized.undatedRecords.flatMap((row) => row.warnings)
  ]);
  normalized.summary = summaryFor(normalized);
  return normalized;
}

function mergeCollection<T extends MergeableWellnessRecord>(target: T[], incoming: T[]): void {
  for (const record of incoming) {
    if (!record.date) {
      continue;
    }
    const existing = target.find((item) => item.date === record.date);
    if (!existing) {
      target.push({ ...record, sourceFiles: unique(record.sourceFiles), warnings: unique(record.warnings) });
      continue;
    }
    existing.sourceFiles = unique([...existing.sourceFiles, ...record.sourceFiles]);
    const existingRecord = existing as MergeableWellnessRecord & Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      if (['date', 'sourceFiles', 'warnings'].includes(key) || isBlank(value)) {
        continue;
      }
      const current = existingRecord[key];
      if (isBlank(current)) {
        existingRecord[key] = value;
      } else if (current !== value) {
        existing.warnings = unique([
          ...existing.warnings,
          `Konflikt pola ${key} dla ${record.date}: zachowano ${String(current)}, pominięto ${String(value)}.`
        ]);
      }
    }
    existing.warnings = unique([...existing.warnings, ...record.warnings]);
  }
}

function summaryFor(report: WellnessReport): WellnessSummary {
  const dates = unique(
    [
      ...report.dailyActivity.map((row) => row.date),
      ...report.sleepSummaries.map((row) => row.date),
      ...report.nightlyRecharge.map((row) => row.date),
      ...report.dailyHeartRate.map((row) => row.date)
    ].filter((date): date is string => Boolean(date))
  ).sort();
  const sleepScores = report.sleepSummaries
    .map((row) => row.sleepScore)
    .filter((value): value is number => typeof value === 'number');
  const sleepDurations = report.sleepSummaries
    .map((row) => row.durationMinutes)
    .filter((value): value is number => typeof value === 'number');
  return {
    dailyActivityDays: report.dailyActivity.filter(hasDate).length,
    sleepNights: report.sleepSummaries.filter(hasDate).length,
    sleepStageRecords: report.sleepStages.filter(hasDate).length,
    nightlyRechargeDays: report.nightlyRecharge.filter(hasDate).length,
    dailyHeartRateDays: report.dailyHeartRate.filter(hasDate).length,
    dateStart: dates[0] ?? null,
    dateEnd: dates[dates.length - 1] ?? null,
    averageSleepScore: average(sleepScores),
    averageSleepDurationMinutes: average(sleepDurations),
    warningCount: report.warnings.length
  };
}

function missingDataRows(report: WellnessReport): Array<{ report: string; field: string; count: number }> {
  return [
    ...missingRows('daily-activity.csv', report.dailyActivity, ['steps', 'calories', 'activeTimeMinutes']),
    ...missingRows('sleep-summary.csv', report.sleepSummaries, ['sleepScore', 'durationMinutes', 'actualSleepMinutes']),
    ...missingRows('nightly-recharge.csv', report.nightlyRecharge, ['rechargeStatus', 'ansCharge', 'hrvMs']),
    ...missingRows('daily-heart-rate.csv', report.dailyHeartRate, ['averageHeartRate', 'restingHeartRate'])
  ];
}

function missingRows<T extends object>(reportName: string, rows: T[], fields: string[]) {
  return fields
    .map((field) => ({
      report: reportName,
      field,
      count: rows.filter((row) => isBlank((row as Record<string, unknown>)[field])).length
    }))
    .filter((row) => row.count > 0 && rows.length > 0);
}

function csvRows(header: string[], rows: unknown[][]): string {
  return [header.join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\n');
}

function csvEscape(value: unknown): string {
  const text = isBlank(value) ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function addText(zip: JSZip, entries: string[], path: string, content: string): void {
  zip.file(path, content);
  entries.push(path);
}

function sortDatedCollection<T extends { date: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
}

function hasDate<T extends { date: string | null }>(item: T): item is T & { date: string } {
  return Boolean(item.date);
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values.filter((value) => !isBlank(value))));
}

function average(values: number[]): number | null {
  if (!values.length) {
    return null;
  }
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function displayValue(value: unknown): string {
  return isBlank(value) ? 'brak' : String(value);
}

function minutesValue(value: number | null): string {
  return value === null ? 'brak' : `${Math.round(value)} min`;
}

function dateRange(summary: WellnessSummary): string {
  if (!summary.dateStart && !summary.dateEnd) {
    return 'brak';
  }
  return summary.dateStart === summary.dateEnd ? summary.dateStart ?? 'brak' : `${summary.dateStart} - ${summary.dateEnd}`;
}

function metric(label: string, value: unknown): string {
  return `<div class="metric"><span>${escapeHtml(label)}</span><span class="value">${escapeHtml(displayValue(value))}</span></div>`;
}

function table(header: string[], rows: string[][]): string {
  return `<table><thead><tr>${header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function utcDateMinute(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    return 'unknown-date_unknown-time';
  }
  return date.toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
}
