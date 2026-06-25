import JSZip from 'jszip';
import { I18nService } from '@app/core/i18n/i18n.service';
import {
  ConversionResult,
  ExportFormat,
  FileLoadIssue,
  GarminReadyReportItem,
  ImportedPolarFile,
  PolarFileClassification,
  WellnessReport
} from '@shared/models';
import { garminReadyReportToCsv } from './garmin-ready-report';
import { addWellnessReports, wellnessReportHasData } from './wellness-exporter';

export interface MigrationExportOptions {
  includeTcx: boolean;
  includeFit: boolean;
  includeReports: boolean;
  includeWellnessReports: boolean;
  includeReadme: boolean;
}

export type MigrationExportPhase = 'idle' | 'converting_tcx' | 'converting_fit' | 'packaging' | 'done' | 'error';

export interface MigrationExportProgress {
  phase: MigrationExportPhase;
  totalActivities: number;
  processedActivities: number;
  currentFile: string;
  successes: number;
  warnings: number;
  errors: number;
}

export interface MigrationPackageInput {
  options: MigrationExportOptions;
  classificationReport: PolarFileClassification[];
  garminReadyReport: GarminReadyReportItem[];
  conversionResults: ConversionResult[];
  wellnessReport?: WellnessReport | null;
  importedFiles: ImportedPolarFile[];
  fileIssues: FileLoadIssue[];
  createdAt: Date;
  sourceZipFilename: string | null;
  i18n?: I18nService;
}

export interface MigrationPackage {
  filename: string;
  blob: Blob;
  entries: string[];
}

export const DEFAULT_MIGRATION_EXPORT_OPTIONS: MigrationExportOptions = {
  includeTcx: true,
  includeFit: true,
  includeReports: true,
  includeWellnessReports: true,
  includeReadme: true
};

export async function createMigrationPackage(input: MigrationPackageInput): Promise<MigrationPackage> {
  const zip = new JSZip();
  const entries: string[] = [];
  const usedArchivePaths = new Set<string>();

  if (input.options.includeTcx) {
    addActivityResults(zip, entries, usedArchivePaths, input.conversionResults, 'tcx', input);
  }

  if (input.options.includeFit) {
    addActivityResults(zip, entries, usedArchivePaths, input.conversionResults, 'fit', input);
  }

  if (input.options.includeReports) {
    addText(zip, entries, 'reports/import-summary.csv', importSummaryToCsv(input));
    addText(zip, entries, 'reports/file-classification-report.csv', classificationReportToCsv(input.classificationReport));
    addText(zip, entries, 'reports/garmin-ready-report.csv', garminReadyReportToCsv(input.garminReadyReport));
    addText(zip, entries, 'reports/garmin-ready-report.json', JSON.stringify(input.garminReadyReport, null, 2));
    addText(zip, entries, 'reports/warnings.csv', warningsToCsv(input));
    addText(zip, entries, 'reports/skipped-files.csv', skippedFilesToCsv(input));
  }

  if (input.options.includeWellnessReports) {
    addWellnessReports(zip, entries, input.wellnessReport, input.i18n);
  }

  if (input.options.includeReadme) {
    addText(zip, entries, 'README_IMPORT.txt', readmeImportText(input));
  }

  if (!entries.length) {
    addText(
      zip,
      entries,
      'README_IMPORT.txt',
      translate(input, 'reports.readmeNoElements', 'No export elements selected. Go back to the app and select at least one package option.')
    );
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  return {
    filename: migrationArchiveFilename(input.createdAt),
    blob,
    entries
  };
}

export function migrationArchiveFilename(createdAt: Date): string {
  return `polar-to-garmin-export-${utcDateMinute(createdAt)}.zip`;
}

export function safeActivityFilename(
  result: ConversionResult,
  extension: ExportFormat,
  usedArchivePaths: Set<string> = new Set<string>(),
  directory = `activities/${extension}`
): string {
  const activity = result.activity;
  const timestamp = activity?.startTime ? utcDateMinute(new Date(activity.startTime)) : 'unknown-date_unknown-time';
  const sport = slug(activity?.sportDetail || activity?.sport || stem(result.filename) || 'activity');
  const sourceIdentifier = activity?.activityId || stem(activity?.sourceFilename || result.filename);
  const identifier = slug(sourceIdentifier || 'activity');
  const polarIdentifier = identifier.startsWith('polar-') ? identifier : `polar-${identifier}`;
  const base = `${timestamp}_${sport}_${polarIdentifier}`;
  let filename = `${base}.${extension}`;
  let archivePath = `${directory}/${filename}`;
  let suffix = 2;

  while (usedArchivePaths.has(archivePath)) {
    filename = `${base}_${suffix}.${extension}`;
    archivePath = `${directory}/${filename}`;
    suffix += 1;
  }

  usedArchivePaths.add(archivePath);
  return filename;
}

export function classificationReportToCsv(report: PolarFileClassification[]): string {
  const header = ['path', 'filename', 'sizeBytes', 'category', 'confidence', 'reason', 'warnings', 'detectedKeys'];
  const rows = report.map((item) =>
    [
      item.path,
      item.filename,
      String(item.sizeBytes),
      item.category,
      item.confidence,
      item.reason,
      item.warnings.join('; '),
      item.detectedKeys.join('; ')
    ].map(csvEscape)
  );
  return [header.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

function addActivityResults(
  zip: JSZip,
  entries: string[],
  usedArchivePaths: Set<string>,
  results: ConversionResult[],
  format: ExportFormat,
  input: Pick<MigrationPackageInput, 'i18n'>
): void {
  const directory = `activities/${format}`;
  const successes = results.filter((result) => result.format === format && result.status === 'success' && result.content);

  if (!successes.length) {
    addText(
      zip,
      entries,
      `${directory}/NOT_AVAILABLE.txt`,
      translate(input, 'reports.notAvailable', 'No {{format}} files were generated. Check reports/skipped-files.csv and reports/warnings.csv.', {
        format: format.toUpperCase()
      })
    );
    return;
  }

  for (const result of successes) {
    const filename = safeActivityFilename(result, format, usedArchivePaths, directory);
    addFile(zip, entries, `${directory}/${filename}`, result.content);
  }
}

function importSummaryToCsv(input: MigrationPackageInput): string {
  const summary = migrationSummary(input);
  const rows: Array<[string, string]> = [
    ['createdAt', input.createdAt.toISOString()],
    ['sourceZipFilename', input.sourceZipFilename ?? ''],
    ['importedFiles', String(input.importedFiles.length)],
    ['classifiedFiles', String(input.classificationReport.length)],
    ['fileIssues', String(input.fileIssues.length)],
    ['readyActivities', String(input.classificationReport.filter(isReadyTrainingClassification).length)],
    ['garminReadyActivities', String(input.garminReadyReport.filter((item) => item.status === 'ready').length)],
    ['garminWarningActivities', String(input.garminReadyReport.filter((item) => item.status === 'warning').length)],
    ['garminBlockedActivities', String(input.garminReadyReport.filter((item) => item.status === 'error').length)],
    ['generatedTcx', String(summary.generatedTcx)],
    ['generatedFit', String(summary.generatedFit)],
    ['warnings', String(summary.warningCount)],
    ['errors', String(summary.errorCount)],
    [
      'wellnessReports',
      input.options.includeWellnessReports
        ? wellnessReportHasData(input.wellnessReport)
          ? 'generated'
          : 'no_wellness_records'
        : 'not_selected'
    ]
  ];
  return ['metric,value', ...rows.map((row) => row.map(csvEscape).join(','))].join('\n');
}

function warningsToCsv(input: MigrationPackageInput): string {
  const rows = [
    ...input.classificationReport.flatMap((item) =>
      item.warnings.map((warning) => ['classification', item.path, '', warning])
    ),
    ...input.conversionResults.flatMap((result) =>
      result.warnings.map((warning) => [
        'conversion',
        result.activity?.sourceFilename || result.filename,
        result.format,
        warning
      ])
    )
  ];
  return [
    'source,path,format,message',
    ...rows.map((row) => row.map((value) => csvEscape(String(value))).join(','))
  ].join('\n');
}

function skippedFilesToCsv(input: MigrationPackageInput): string {
  const skippedClassifications = input.classificationReport
    .filter((item) => !isReadyTrainingClassification(item))
    .map((item) => [item.path, item.category, '', item.reason, item.warnings.join('; ')]);
  const conversionErrors = input.conversionResults
    .filter((result) => result.status === 'error')
    .map((result) => [
      result.activity?.sourceFilename || result.filename,
      '',
      result.format,
      translate(input, 'reports.conversionError', 'Conversion error'),
      result.errors.join('; ')
    ]);
  const fileIssues = input.fileIssues.map((issue) => [issue.filename, 'file_issue', '', translate(input, 'reports.importError', 'Import error'), issue.reason]);
  const rows = [...skippedClassifications, ...conversionErrors, ...fileIssues];

  return [
    'path,category,format,reason,details',
    ...rows.map((row) => row.map((value) => csvEscape(String(value))).join(','))
  ].join('\n');
}

function readmeImportText(input: MigrationPackageInput): string {
  const summary = migrationSummary(input);
  return [
    translate(input, 'reports.readmeTitle', 'Polar Flow -> Garmin migration package'),
    '',
    `${translate(input, 'reports.createdAt', 'Created at')}: ${input.createdAt.toISOString()}`,
    `${translate(input, 'reports.sourceZip', 'Source ZIP')}: ${input.sourceZipFilename ?? translate(input, 'reports.notProvided', 'not provided')}`,
    `${translate(input, 'reports.processedFiles', 'Processed files')}: ${input.classificationReport.length}`,
    `${translate(input, 'reports.generatedTcx', 'Generated TCX files')}: ${summary.generatedTcx}`,
    `${translate(input, 'reports.generatedFit', 'Generated FIT files')}: ${summary.generatedFit}`,
    `${translate(input, 'common.warnings', 'Warnings')}: ${summary.warningCount}`,
    `${translate(input, 'common.errors', 'Errors')}: ${summary.errorCount}`,
    '',
    translate(input, 'reports.garminImportTitle', 'Garmin Connect import:'),
    translate(input, 'reports.garminImportStep1', '1. Open Garmin Connect in a browser.'),
    translate(input, 'reports.garminImportStep2', '2. Go to Import Data / Upload activities.'),
    translate(input, 'reports.garminImportStep3', '3. Upload files from activities/tcx or activities/fit.'),
    translate(input, 'reports.garminImportStep4', '4. If Garmin rejects one file, check reports/warnings.csv and reports/skipped-files.csv.'),
    '',
    translate(input, 'reports.limitationsTitle', 'Limitations:'),
    translate(input, 'reports.limitationFit', '- FIT export is experimental local and may still be rejected by Garmin Connect.'),
    translate(input, 'reports.limitationMissingData', '- Missing source data is reported as warnings instead of being fabricated.'),
    translate(
      input,
      'reports.limitationWellness',
      '- Wellness/sleep reports are local archive reports; Garmin Connect does not provide a stable public import for Polar Flow sleep history.'
    ),
    '',
    translate(input, 'reports.privacyTitle', 'Privacy:'),
    translate(input, 'reports.privacyText', 'All files were prepared directly in the browser. Training data is not uploaded to a server.')
  ].join('\n');
}

function translate(input: Pick<MigrationPackageInput, 'i18n'>, key: string, fallback: string, params?: Record<string, string | number>): string {
  const translated = input.i18n?.t(key, params);
  return translated && translated !== key ? translated : interpolateFallback(fallback, params);
}

function interpolateFallback(value: string, params: Record<string, string | number> | undefined): string {
  if (!params) {
    return value;
  }
  return value.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key: string) => {
    const replacement = params[key];
    return replacement === undefined ? match : String(replacement);
  });
}

function migrationSummary(input: MigrationPackageInput): { generatedTcx: number; generatedFit: number; warningCount: number; errorCount: number } {
  return {
    generatedTcx: input.conversionResults.filter((result) => result.format === 'tcx' && result.status === 'success').length,
    generatedFit: input.conversionResults.filter((result) => result.format === 'fit' && result.status === 'success').length,
    warningCount:
      input.classificationReport.reduce((sum, item) => sum + item.warnings.length, 0) +
      input.conversionResults.reduce((sum, result) => sum + result.warnings.length, 0),
    errorCount:
      input.fileIssues.length + input.conversionResults.reduce((sum, result) => sum + result.errors.length, 0)
  };
}

function isReadyTrainingClassification(item: PolarFileClassification): boolean {
  const maybeResult = item as PolarFileClassification & { isConvertible?: boolean; status?: string };
  if (maybeResult.status) {
    return maybeResult.status === 'ready' && maybeResult.isConvertible !== false;
  }
  return item.category === 'training_session';
}

function addText(zip: JSZip, entries: string[], path: string, content: string): void {
  addFile(zip, entries, path, content);
}

function addFile(zip: JSZip, entries: string[], path: string, content: string | Uint8Array): void {
  zip.file(path, content);
  entries.push(path);
}

function utcDateMinute(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    return 'unknown-date_unknown-time';
  }
  return date.toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
}

function slug(value: string): string {
  return (
    value
      .replace(/[łŁ]/g, (match) => (match === 'Ł' ? 'L' : 'l'))
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'activity'
  );
}

function stem(filename: string): string {
  const basename = filename.split('/').pop() ?? filename;
  return basename.replace(/\.[^.]+$/u, '');
}

function csvEscape(value: string): string {
  if (!/[",\n\r;]/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
}
