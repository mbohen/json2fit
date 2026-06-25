import { computed, Injectable, signal } from '@angular/core';
import JSZip from 'jszip';
import { I18nService } from '@app/core/i18n/i18n.service';
import { TranslationParams, TranslationValue } from '@app/core/i18n/i18n.model';
import { SportDisplayNameService } from '@app/shared/sports/sport-display-name';
import plTranslations from '../../../assets/i18n/pl.json';
import { BetaSignalEvent } from '@features/beta/beta-signal.model';
import { BetaSignalService } from '@features/beta/beta-signal.service';
import {
  ActivitySummary,
  ConversionResult,
  ExportFormat,
  FileLoadIssue,
  FileLoadProgress,
  FileLoadSource,
  GarminReadyReportItem,
  ImportedPolarFile,
  InputFile,
  NormalizedActivity,
  NormalizedActivityResult,
  PolarFileCategory,
  PolarFileClassification,
  PolarFileClassificationResult,
  WellnessReport
} from '@shared/models';
import { DownloadService } from './download.service';
import { FileLoaderService } from './file-loader.service';
import { garminReadyReportToCsv } from './garmin-ready-report';
import {
  classificationReportToCsv as migrationClassificationReportToCsv,
  createMigrationPackage,
  DEFAULT_MIGRATION_EXPORT_OPTIONS,
  MigrationExportOptions,
  MigrationExportProgress
} from './migration-package-exporter';
import { PyodideConverterService } from './pyodide-converter.service';
import { createWellnessPackage, mergeWellnessReports, wellnessReportHasData } from './wellness-exporter';
import {
  createGarminDiagnosticReport,
  diagnosticReportToText,
  GarminDiagnosticReport,
  GpsAnonymizationMode
} from './garmin-diagnostics';
import {
  localizeClassificationResult,
  localizeConversionResult,
  localizeNormalizedActivityResult,
  localizeWellnessReport,
  translateWorkerMessage
} from './worker-message-i18n';

export { classificationReportToCsv } from './migration-package-exporter';

export const MAX_WORKER_BATCH_PAYLOAD_BYTES = 4 * 1024 * 1024;
const MAX_WORKER_BATCH_FILES = 25;

export interface DiagnosticMessage {
  id: string;
  filename: string;
  message: string;
}

export interface ClassificationCategorySummary {
  category: PolarFileCategory;
  label: string;
  count: number;
  action: string;
}

export interface ActivityPreviewCandidate extends PolarFileClassificationResult {
  activity: ActivitySummary;
  garminReady: GarminReadyReportItem;
}

export type SuccessfulExportKind = 'tcx' | 'fit' | 'zip' | 'csv' | 'json';

export interface SuccessfulExportNotice {
  kind: SuccessfulExportKind;
  filename: string;
  completedAt: string;
}

const CLASSIFICATION_CATEGORY_ORDER: PolarFileCategory[] = [
  'training_session',
  'daily_activity',
  'sleep_or_wellness',
  'account_data',
  'unknown_numeric',
  'unknown_json',
  'ignored_non_json',
  'invalid_json'
];

const FALLBACK_STORE_LANGUAGE = signal<'pl'>('pl');
const DIRECT_CONSTRUCTION_I18N = {
  currentLanguage: FALLBACK_STORE_LANGUAGE,
  locale: () => 'pl-PL',
  t: (key: string, params?: TranslationParams) => {
    const value = lookupFallbackTranslation(key);
    return typeof value === 'string' ? interpolateFallbackTranslation(value, params) : key;
  },
  list: <T = unknown>(key: string): readonly T[] => {
    const value = lookupFallbackTranslation(key);
    return Array.isArray(value) ? (value as T[]) : [];
  },
  formatDate: (value: string | Date, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }) =>
    new Intl.DateTimeFormat('pl-PL', options).format(typeof value === 'string' ? new Date(value) : value),
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat('pl-PL', options).format(value)
} as I18nService;

const DIRECT_CONSTRUCTION_SPORT_NAMES = {
  displayActivitySportName: (activity: Pick<ActivitySummary, 'sport' | 'sportDetail'>) => activity.sportDetail || activity.sport || 'Inna aktywność',
  displaySportName: (sport: string | null | undefined) => sport || 'Inna aktywność'
} as SportDisplayNameService;

@Injectable({ providedIn: 'root' })
export class ConverterStore {
  readonly files = signal<InputFile[]>([]);
  readonly fileIssues = signal<FileLoadIssue[]>([]);
  readonly importedPolarFiles = signal<ImportedPolarFile[]>([]);
  readonly importProgress = signal<FileLoadProgress | null>(null);
  readonly importedSource = signal<FileLoadSource | null>(null);
  readonly importedZipFilename = signal<string | null>(null);
  readonly classifications = signal<PolarFileClassificationResult[]>([]);
  readonly localizedClassifications = computed<PolarFileClassificationResult[]>(() => {
    this.i18n.currentLanguage();
    return this.classifications().map((item) => localizeClassificationResult(item, this.i18n));
  });
  readonly wellnessReport = signal<WellnessReport | null>(null);
  readonly conversionResults = signal<ConversionResult[]>([]);
  readonly localizedWellnessReport = computed<WellnessReport | null>(() => {
    this.i18n.currentLanguage();
    const report = this.wellnessReport();
    return report ? localizeWellnessReport(report, this.i18n) : null;
  });
  readonly localizedConversionResults = computed<ConversionResult[]>(() => {
    this.i18n.currentLanguage();
    return this.conversionResults().map((result) => localizeConversionResult(result, this.i18n));
  });
  readonly selectedActivityPath = signal<string | null>(null);
  readonly activityPreviewCache = signal<Record<string, NormalizedActivityResult>>({});
  readonly activityPreviewLoadingPath = signal<string | null>(null);
  readonly activityPreviewError = signal<string | null>(null);
  readonly diagnosticGpsMode = signal<GpsAnonymizationMode>('none');
  readonly diagnosticClipboardMessage = signal<string | null>(null);
  readonly migrationExportOptions = signal<MigrationExportOptions>({ ...DEFAULT_MIGRATION_EXPORT_OPTIONS });
  readonly migrationExportProgress = signal<MigrationExportProgress | null>(null);
  readonly lastSuccessfulExport = signal<SuccessfulExportNotice | null>(null);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly errors = signal<string[]>([]);

  readonly runtimeStatus = this.pyodide.status;
  readonly runtimeError = this.pyodide.error;
  private importSessionId = 0;
  private readonly i18n: I18nService;
  private readonly sportDisplayNames: SportDisplayNameService;
  private readonly betaSignals?: BetaSignalService;

  readonly readyToConvert = computed(() => this.localizedClassifications().filter((item) => isGarminExportable(item)));
  readonly skippedSensitive = computed(() =>
    this.localizedClassifications().filter((item) => item.status === 'skipped_sensitive')
  );
  readonly skippedNonTraining = computed(() =>
    this.localizedClassifications().filter((item) => item.status === 'skipped_non_training')
  );
  readonly needsAnalysis = computed(() => this.localizedClassifications().filter((item) => item.status === 'needs_analysis'));
  readonly invalidFiles = computed(() => this.localizedClassifications().filter((item) => item.status === 'invalid'));
  readonly classificationReport = computed<PolarFileClassification[]>(() => [
    ...this.localizedClassifications(),
    ...this.importedPolarFiles()
      .filter((item) => item.kind !== 'json')
      .map((item) => ignoredImportToClassification(item, this.i18n))
  ]);
  readonly classificationSummary = computed<ClassificationCategorySummary[]>(() => {
    this.i18n.currentLanguage();
    const counts = new Map<PolarFileCategory, number>();
    for (const item of this.classificationReport()) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    }
    return CLASSIFICATION_CATEGORY_ORDER.map((category) => ({
      category,
      label: this.i18n.t(`polar.category.${category}`),
      count: counts.get(category) ?? 0,
      action: this.i18n.t(`polar.actions.${category}`)
    }));
  });
  readonly importedJsonCount = computed(() => this.importedPolarFiles().filter((item) => item.kind === 'json').length);
  readonly ignoredImportCount = computed(() => this.importedPolarFiles().filter((item) => item.kind === 'ignored').length);
  readonly unsupportedImportCount = computed(
    () => this.importedPolarFiles().filter((item) => item.kind === 'unsupported').length
  );
  readonly activities = computed<ActivitySummary[]>(() =>
    this.classifications()
      .map((item) => item.activity)
      .filter((activity): activity is ActivitySummary => Boolean(activity))
  );
  readonly activityPreviewCandidates = computed<ActivityPreviewCandidate[]>(() =>
    this.localizedClassifications().filter(isActivityPreviewCandidate)
  );
  readonly activityValidationCards = computed(() => this.activityPreviewCandidates());
  readonly selectedActivityCandidate = computed<ActivityPreviewCandidate | null>(() => {
    const candidates = this.activityPreviewCandidates();
    if (!candidates.length) {
      return null;
    }
    const selectedPath = this.selectedActivityPath();
    return candidates.find((item) => item.path === selectedPath) ?? candidates[0];
  });
  readonly selectedActivityPreviewResult = computed<NormalizedActivityResult | null>(() => {
    const path = this.selectedActivityCandidate()?.path;
    const result = path ? (this.activityPreviewCache()[path] ?? null) : null;
    return result ? localizeNormalizedActivityResult(result, this.i18n) : null;
  });
  readonly selectedActivityPreview = computed<NormalizedActivity | null>(
    () => this.selectedActivityPreviewResult()?.activity ?? null
  );
  readonly diagnosticGpsAvailable = computed(() => {
    const validation = this.selectedActivityCandidate()?.garminReady;
    return Boolean(validation?.hasGps && validation.trackpointCount > 0);
  });
  readonly effectiveDiagnosticGpsMode = computed<GpsAnonymizationMode>(() =>
    this.diagnosticGpsAvailable() ? this.diagnosticGpsMode() : 'none'
  );
  readonly selectedDiagnosticReport = computed<GarminDiagnosticReport | null>(() => {
    const candidate = this.selectedActivityCandidate();
    const validation = candidate?.garminReady;
    if (!validation) {
      return null;
    }
    return createGarminDiagnosticReport({
      validation,
      activity: this.selectedActivityPreview(),
      gpsMode: this.effectiveDiagnosticGpsMode(),
      i18n: this.i18n,
      sportMappingLabel: this.sportDisplayNames.displayActivitySportName(validation)
    });
  });
  readonly selectedDiagnosticReportText = computed(() => {
    const report = this.selectedDiagnosticReport();
    return report ? diagnosticReportToText(report, this.i18n) : '';
  });
  readonly garminReadyReport = computed(() =>
    this.localizedClassifications()
      .map((item) => item.garminReady)
      .filter((item): item is GarminReadyReportItem => Boolean(item))
  );
  readonly migrationExportSelectionValid = computed(() =>
    Object.values(this.migrationExportOptions()).some((selected) => selected)
  );
  readonly wellnessHasData = computed(() => wellnessReportHasData(this.localizedWellnessReport()));
  readonly wellnessDailyActivityCount = computed(() => this.localizedWellnessReport()?.summary.dailyActivityDays ?? 0);
  readonly wellnessSleepCount = computed(() => this.localizedWellnessReport()?.summary.sleepNights ?? 0);
  readonly wellnessNightlyRechargeCount = computed(() => this.localizedWellnessReport()?.summary.nightlyRechargeDays ?? 0);
  readonly wellnessDailyHeartRateCount = computed(() => this.localizedWellnessReport()?.summary.dailyHeartRateDays ?? 0);
  readonly wellnessDateRangeLabel = computed(() => {
    const summary = this.localizedWellnessReport()?.summary;
    if (!summary?.dateStart && !summary?.dateEnd) {
      return this.i18n.t('common.missing');
    }
    if (summary.dateStart === summary.dateEnd) {
      return summary.dateStart ?? this.i18n.t('common.missing');
    }
    return `${summary.dateStart ?? '?'} - ${summary.dateEnd ?? '?'}`;
  });
  readonly wellnessSourceFileCount = computed(() => {
    const report = this.localizedWellnessReport();
    if (!report) {
      return 0;
    }
    return new Set([
      ...report.dailyActivity.flatMap((item) => item.sourceFiles),
      ...report.sleepSummaries.flatMap((item) => item.sourceFiles),
      ...report.sleepStages.map((item) => item.sourceFile),
      ...report.nightlyRecharge.flatMap((item) => item.sourceFiles),
      ...report.dailyHeartRate.flatMap((item) => item.sourceFiles),
      ...report.undatedRecords.flatMap((item) => item.sourceFiles ?? []),
      ...report.undatedRecords.map((item) => item.sourceFile ?? ''),
      ...report.skippedRecords.map((item) => item.sourceFile)
    ].filter(Boolean)).size;
  });
  readonly wellnessAvailableReports = computed(() => {
    const report = this.localizedWellnessReport();
    if (!report || !wellnessReportHasData(report)) {
      return [];
    }
    return [
      report.dailyActivity.length ? 'daily-activity.csv' : '',
      report.sleepSummaries.length ? 'sleep-summary.csv' : '',
      report.sleepStages.filter((item) => item.date).length ? 'sleep-stages.csv' : '',
      report.nightlyRecharge.length ? 'nightly-recharge.csv' : '',
      report.dailyHeartRate.length ? 'daily-heart-rate.csv' : '',
      'wellness-normalized.json',
      'wellness-report.html'
    ].filter(Boolean);
  });
  readonly allWarnings = computed(() =>
    [
      ...this.localizedClassifications()
        .filter((item) => item.isConvertible)
        .flatMap((item) =>
          item.warnings.map((warning, index) => ({
            id: `classification:${item.path}:${index}:${warning}`,
            filename: item.path,
            message: warning
          }))
        ),
      ...this.localizedConversionResults().flatMap((result, resultIndex) =>
        result.warnings.map((warning, warningIndex) => ({
          id: `conversion:${resultIndex}:${warningIndex}:${result.filename}`,
          filename: result.filename,
          message: warning
        }))
      )
    ] satisfies DiagnosticMessage[]
  );

  constructor(
    private readonly fileLoader: FileLoaderService,
    private readonly pyodide: PyodideConverterService,
    private readonly downloads: DownloadService,
    i18n: I18nService = DIRECT_CONSTRUCTION_I18N,
    sportDisplayNames: SportDisplayNameService = DIRECT_CONSTRUCTION_SPORT_NAMES,
    betaSignals?: BetaSignalService
  ) {
    this.i18n = i18n;
    this.sportDisplayNames = sportDisplayNames;
    this.betaSignals = betaSignals;
    this.message.set(this.i18n.t('converter.messages.initial'));
  }

  async loadFiles(fileList: FileList | File[]): Promise<void> {
    const importSessionId = ++this.importSessionId;
    this.busy.set(true);
    this.resetImportState();
    this.recordBetaSignal('upload_started');
    this.message.set(this.i18n.t('converter.messages.loadingFiles'));
    try {
      const result = await this.fileLoader.loadFiles(fileList, (progress) => {
        if (!this.isCurrentImportSession(importSessionId)) {
          return;
        }
        this.importProgress.set(progress);
        this.message.set(progressMessage(progress, this.i18n));
      });
      if (!this.isCurrentImportSession(importSessionId)) {
        return;
      }
      this.recordBetaSignal(result.source === 'zip' ? 'zip_uploaded' : 'json_uploaded');
      this.files.set(result.files);
      this.fileIssues.set(result.issues);
      this.importedPolarFiles.set(result.importedFiles ?? []);
      this.importedSource.set(result.source);
      this.importedZipFilename.set(result.source === 'zip' ? result.sourceFilename ?? null : null);
      if (!result.files.length) {
        this.classifications.set([]);
        this.message.set(this.i18n.t('converter.messages.noJson'));
        return;
      }
      this.message.set(this.i18n.t('converter.messages.checkingFiles'));
      const reportImportProgress = result.source === 'zip' || result.source === 'folder';
      if (reportImportProgress) {
        this.importProgress.set({
          stage: 'classifying',
          processedFiles: 0,
          totalFiles: result.files.length,
          currentPath: result.files[0]?.filename ?? result.sourceFilename
        });
      }
      const classifications = await this.classifyFilesInBatches(
        result.files,
        reportImportProgress,
        result.sourceFilename,
        importSessionId
      );
      if (!this.isCurrentImportSession(importSessionId)) {
        return;
      }
      this.classifications.set(classifications);
      this.recordBetaSignal('files_classified');
      this.selectFirstActivityPreview();
      if (!this.isCurrentImportSession(importSessionId)) {
        return;
      }
      this.message.set(this.i18n.t('converter.messages.wellnessAnalysis'));
      if (reportImportProgress) {
        this.importProgress.set({
          stage: 'analyzing_wellness',
          processedFiles: 0,
          totalFiles: result.files.length,
          currentPath: result.files[0]?.filename ?? result.sourceFilename
        });
      }
      this.wellnessReport.set(
        await this.analyzeWellnessFilesInBatches(
          result.files,
          reportImportProgress,
          result.sourceFilename,
          importSessionId
        )
      );
      if (!this.isCurrentImportSession(importSessionId)) {
        return;
      }
      this.message.set(this.i18n.t('converter.messages.classificationDone'));
      if (reportImportProgress) {
        this.importProgress.set({
          stage: 'done',
          processedFiles: result.files.length,
          totalFiles: result.files.length,
          currentPath: result.source === 'zip' ? result.sourceFilename : result.files[result.files.length - 1]?.filename
        });
      }
    } catch (error) {
      if (!this.isCurrentImportSession(importSessionId)) {
        return;
      }
      this.errors.set([error instanceof Error ? error.message : String(error)]);
      const progress = this.importProgress();
      if (progress) {
        this.importProgress.set({ ...progress, stage: 'error' });
      }
      this.message.set(this.i18n.t('converter.messages.processingFailed'));
    } finally {
      if (this.isCurrentImportSession(importSessionId)) {
        this.busy.set(false);
      }
    }
  }

  async exportOne(classification: PolarFileClassificationResult): Promise<void> {
    await this.exportOneTcx(classification);
  }

  async exportOneTcx(classification: PolarFileClassificationResult): Promise<void> {
    this.recordBetaSignal('tcx_export_clicked');
    if (!isGarminExportable(classification)) {
      this.errors.set([garminBlockedMessage(classification, this.i18n)]);
      return;
    }
    const file = this.files().find((item) => item.filename === classification.path);
    if (!file) {
      this.errors.set([this.i18n.t('converter.messages.sourceFileMissing', { path: classification.path })]);
      return;
    }
    this.busy.set(true);
    this.message.set(`${this.i18n.t('converter.exportTcx')}: ${classification.path}`);
    try {
      const result = await this.pyodide.convertToTcx(file);
      this.conversionResults.update((results) => [...results, result]);
      if (result.status === 'success') {
        this.downloads.downloadResult(result);
        this.markSuccessfulExport('tcx', result.filename);
        this.message.set(this.i18n.t('converter.messages.downloaded', { filename: result.filename }));
      } else {
        this.errors.set(result.errors.map((error) => translateWorkerMessage(error, this.i18n)));
      }
    } finally {
      this.busy.set(false);
    }
  }

  async exportOneFit(classification: PolarFileClassificationResult): Promise<void> {
    this.recordBetaSignal('fit_export_clicked');
    if (!isGarminExportable(classification)) {
      this.errors.set([garminBlockedMessage(classification, this.i18n)]);
      return;
    }
    const file = this.files().find((item) => item.filename === classification.path);
    if (!file) {
      this.errors.set([this.i18n.t('converter.messages.sourceFileMissing', { path: classification.path })]);
      return;
    }
    this.busy.set(true);
    this.message.set(`${this.i18n.t('converter.exportFit')}: ${classification.path}`);
    try {
      const result = await this.pyodide.convertToFit(file);
      this.conversionResults.update((results) => [...results, result]);
      if (result.status === 'success') {
        this.downloads.downloadResult(result);
        this.markSuccessfulExport('fit', result.filename);
        this.message.set(this.i18n.t('converter.messages.downloaded', { filename: result.filename }));
      } else {
        this.errors.set(result.errors.map((error) => translateWorkerMessage(error, this.i18n)));
      }
    } finally {
      this.busy.set(false);
    }
  }

  async exportAllReady(): Promise<void> {
    await this.exportAllReadyTcx();
  }

  async exportAllReadyTcx(): Promise<void> {
    const options: MigrationExportOptions = {
      includeTcx: true,
      includeFit: false,
      includeReports: true,
      includeWellnessReports: false,
      includeReadme: true
    };
    this.recordMigrationExportSignals(options);
    await this.exportMigrationPackage(options);
  }

  async exportAllReadyFit(): Promise<void> {
    const options: MigrationExportOptions = {
      includeTcx: false,
      includeFit: true,
      includeReports: true,
      includeWellnessReports: false,
      includeReadme: true
    };
    this.recordMigrationExportSignals(options);
    await this.exportMigrationPackage(options);
  }

  async exportAllReadyGarminBundle(): Promise<void> {
    const options: MigrationExportOptions = {
      includeTcx: true,
      includeFit: true,
      includeReports: true,
      includeWellnessReports: false,
      includeReadme: true
    };
    this.recordMigrationExportSignals(options);
    await this.exportMigrationPackage(options);
  }

  async exportReportsZip(): Promise<void> {
    const options: MigrationExportOptions = {
      includeTcx: false,
      includeFit: false,
      includeReports: true,
      includeWellnessReports: false,
      includeReadme: true
    };
    this.recordMigrationExportSignals(options);
    await this.exportMigrationPackage(options);
  }

  async exportFullMigrationPackage(): Promise<void> {
    this.recordMigrationExportSignals(DEFAULT_MIGRATION_EXPORT_OPTIONS);
    await this.exportMigrationPackage(DEFAULT_MIGRATION_EXPORT_OPTIONS);
  }

  async exportSelectedMigrationPackage(): Promise<void> {
    const options = this.migrationExportOptions();
    this.recordMigrationExportSignals(options);
    await this.exportMigrationPackage(options);
  }

  async exportWellnessReportsZip(): Promise<void> {
    this.recordBetaSignal('zip_export_clicked');
    this.recordBetaSignal('csv_export_clicked');
    const report = this.localizedWellnessReport();
    if (!report || !wellnessReportHasData(report)) {
      this.errors.set([this.i18n.t('converter.wellnessEmpty')]);
      return;
    }
    this.busy.set(true);
    this.errors.set([]);
    this.message.set(this.i18n.t('converter.messages.buildingWellnessZip'));
    try {
      const wellnessPackage = await createWellnessPackage(report, new Date(), this.i18n);
      this.downloads.downloadBlob(wellnessPackage.filename, wellnessPackage.blob);
      this.markSuccessfulExport('zip', wellnessPackage.filename);
      this.message.set(this.i18n.t('converter.messages.wellnessDownloaded', { filename: wellnessPackage.filename }));
    } finally {
      this.busy.set(false);
    }
  }

  setMigrationExportOption(option: keyof MigrationExportOptions, selected: boolean): void {
    this.migrationExportOptions.update((current) => ({ ...current, [option]: selected }));
  }

  setDiagnosticGpsMode(mode: GpsAnonymizationMode): void {
    if (mode !== 'none' && !this.diagnosticGpsAvailable()) {
      this.diagnosticGpsMode.set('none');
      return;
    }
    this.diagnosticGpsMode.set(mode);
  }

  async copyDiagnosticReport(): Promise<void> {
    const report = this.selectedDiagnosticReportText();
    if (!report) {
      this.errors.set([this.i18n.t('converter.messages.noDiagnosticToCopy')]);
      return;
    }
    if (!navigator.clipboard?.writeText) {
      this.errors.set([this.i18n.t('converter.messages.clipboardUnavailable')]);
      return;
    }
    await navigator.clipboard.writeText(report);
    this.diagnosticClipboardMessage.set(this.i18n.t('converter.messages.diagnosticCopied'));
    this.message.set(this.i18n.t('converter.messages.diagnosticCopied'));
  }

  exportDiagnosticReport(): void {
    const report = this.selectedDiagnosticReport();
    if (!report) {
      this.errors.set([this.i18n.t('converter.messages.noDiagnosticToDownload')]);
      return;
    }
    this.downloads.downloadText(diagnosticFilename(report.fileName, 'txt'), diagnosticReportToText(report, this.i18n), 'text/plain');
    this.message.set(this.i18n.t('converter.messages.diagnosticDownloaded'));
  }

  async exportDiagnosticPackage(): Promise<void> {
    const report = this.selectedDiagnosticReport();
    if (!report) {
      this.errors.set([this.i18n.t('converter.messages.noDiagnosticToDownload')]);
      return;
    }
    const candidate = this.selectedActivityCandidate();
    const zip = new JSZip();
    zip.file('diagnostic-report.txt', diagnosticReportToText(report, this.i18n));
    zip.file('diagnostic-report.json', JSON.stringify(report, null, 2));
    zip.file(
      'validation.json',
      JSON.stringify(
        {
          sourceFile: candidate?.path ?? report.sourceFile,
          garminReady: candidate?.garminReady ?? null,
          classification: candidate
            ? {
                path: candidate.path,
                filename: candidate.filename,
                category: candidate.category,
                kind: candidate.kind,
                status: candidate.status,
                isConvertible: candidate.isConvertible,
                reason: candidate.reason,
                warnings: candidate.warnings,
                detectedKeys: candidate.detectedKeys
              }
            : null
        },
        null,
        2
      )
    );
    zip.file(
      'README.txt',
      [
        this.i18n.t('converter.messages.diagnosticReadmeTitle'),
        '',
        this.i18n.t('converter.messages.diagnosticReadmeLocal'),
        this.i18n.t('converter.messages.diagnosticReadmeNoRawJson'),
        `${this.i18n.t('converter.diagnosticGpsMode')}: ${report.gpsMode}`,
        report.gpsMode === 'full'
          ? this.i18n.t('converter.messages.diagnosticReadmeFullGps')
          : this.i18n.t('converter.messages.diagnosticReadmeNoFullGps')
      ].join('\n')
    );
    const blob = await zip.generateAsync({ type: 'blob' });
    this.downloads.downloadBlob(diagnosticFilename(report.fileName, 'zip'), blob);
    this.message.set(this.i18n.t('converter.messages.diagnosticPackageDownloaded'));
  }

  clearSession(): void {
    this.importSessionId += 1;
    this.busy.set(false);
    this.resetImportState();
    this.migrationExportOptions.set({ ...DEFAULT_MIGRATION_EXPORT_OPTIONS });
    this.diagnosticGpsMode.set('none');
    this.diagnosticClipboardMessage.set(null);
    this.message.set(this.i18n.t('converter.messages.appDataCleared'));
  }

  async selectActivityPreview(path: string): Promise<void> {
    this.selectedActivityPath.set(path);
    await this.loadActivityPreview(path);
  }

  async loadSelectedActivityPreview(): Promise<void> {
    const candidate = this.selectedActivityCandidate();
    if (candidate) {
      await this.loadActivityPreview(candidate.path);
    }
  }

  async loadActivityPreview(path: string): Promise<void> {
    if (this.activityPreviewCache()[path]) {
      this.activityPreviewError.set(null);
      return;
    }

    const file = this.files().find((item) => item.filename === path);
    if (!file) {
      this.activityPreviewError.set(this.i18n.t('converter.messages.sourceFileMissing', { path }));
      return;
    }

    this.activityPreviewLoadingPath.set(path);
    this.activityPreviewError.set(null);
    try {
      const result = await this.pyodide.normalizeActivity(file);
      this.activityPreviewCache.update((current) => ({ ...current, [path]: result }));
      if (result.status === 'error') {
        const translatedErrors = result.errors.map((error) => translateWorkerMessage(error, this.i18n));
        this.activityPreviewError.set(translatedErrors.join(' ') || this.i18n.t('converter.messages.normalizeFailed', { path }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.activityPreviewError.set(translateWorkerMessage(message, this.i18n));
    } finally {
      if (this.activityPreviewLoadingPath() === path) {
        this.activityPreviewLoadingPath.set(null);
      }
    }
  }

  exportClassificationReportJson(): void {
    const report = this.classificationReport();
    if (!report.length) {
      this.errors.set([this.i18n.t('converter.messages.noClassificationReport')]);
      return;
    }
    this.downloads.downloadText(
      'file-classification-report.json',
      JSON.stringify(report, null, 2),
      'application/json'
    );
    this.markSuccessfulExport('json', 'file-classification-report.json');
    this.message.set(this.i18n.t('converter.messages.classificationJsonDownloaded'));
  }

  exportClassificationReportCsv(): void {
    this.recordBetaSignal('csv_export_clicked');
    const report = this.classificationReport();
    if (!report.length) {
      this.errors.set([this.i18n.t('converter.messages.noClassificationReport')]);
      return;
    }
    this.downloads.downloadText('file-classification-report.csv', migrationClassificationReportToCsv(report), 'text/csv');
    this.markSuccessfulExport('csv', 'file-classification-report.csv');
    this.message.set(this.i18n.t('converter.messages.classificationCsvDownloaded'));
  }

  exportGarminReadyReportJson(): void {
    const report = this.garminReadyReport();
    if (!report.length) {
      this.errors.set([this.i18n.t('converter.messages.noGarminReadyReport')]);
      return;
    }
    this.downloads.downloadText(
      'garmin-ready-report.json',
      JSON.stringify(report, null, 2),
      'application/json'
    );
    this.markSuccessfulExport('json', 'garmin-ready-report.json');
    this.message.set(this.i18n.t('converter.messages.garminReadyJsonDownloaded'));
  }

  exportGarminReadyReportCsv(): void {
    this.recordBetaSignal('csv_export_clicked');
    const report = this.garminReadyReport();
    if (!report.length) {
      this.errors.set([this.i18n.t('converter.messages.noGarminReadyReport')]);
      return;
    }
    this.downloads.downloadText('garmin-ready-report.csv', garminReadyReportToCsv(report), 'text/csv');
    this.markSuccessfulExport('csv', 'garmin-ready-report.csv');
    this.message.set(this.i18n.t('converter.messages.garminReadyCsvDownloaded'));
  }

  private async exportMigrationPackage(options: MigrationExportOptions): Promise<void> {
    if (!Object.values(options).some(Boolean)) {
      this.errors.set([this.i18n.t('converter.messages.selectPackageElement')]);
      return;
    }

    const readyNames = new Set(this.readyToConvert().map((item) => item.path));
    const files = this.files().filter((item) => readyNames.has(item.filename));
    const needsActivityExport = options.includeTcx || options.includeFit;
    if (!files.length && needsActivityExport && !this.classificationReport().length) {
      this.errors.set([this.i18n.t('converter.messages.noExportReady')]);
      return;
    }

    const totalExports = files.length * Number(options.includeTcx) + files.length * Number(options.includeFit);
    const results: ConversionResult[] = [];
    this.busy.set(true);
    this.errors.set([]);
    this.migrationExportProgress.set({
      phase: needsActivityExport ? (options.includeTcx ? 'converting_tcx' : 'converting_fit') : 'packaging',
      totalActivities: totalExports,
      processedActivities: 0,
      currentFile: '',
      successes: 0,
      warnings: 0,
      errors: 0
    });
    this.message.set(this.i18n.t('converter.messages.preparingMigrationZip'));
    try {
      if (options.includeTcx && files.length) {
        results.push(
          ...(await this.convertFilesInBatchesWithRecovery(
            files,
            'tcx',
            (batch) => this.pyodide.convertManyToTcx(batch),
            (file) => this.pyodide.convertToTcx(file),
            this.i18n.t('converter.exportTcx')
          ))
        );
        this.conversionResults.set(results);
      }

      if (options.includeFit && files.length) {
        results.push(
          ...(await this.convertFilesInBatchesWithRecovery(
            files,
            'fit',
            (batch) => this.pyodide.convertManyToFit(batch),
            (file) => this.pyodide.convertToFit(file),
            this.i18n.t('converter.exportFit')
          ))
        );
        this.conversionResults.set(results);
      }

      this.conversionResults.set(results);
      this.updateMigrationProgress('packaging', totalExports, totalExports, this.i18n.t('converter.messages.buildingZip'), results);
      const migrationPackage = await createMigrationPackage({
        options,
        classificationReport: this.classificationReport(),
        garminReadyReport: this.garminReadyReport(),
        conversionResults: this.localizedConversionResults(),
        wellnessReport: this.localizedWellnessReport(),
        importedFiles: this.importedPolarFiles(),
        fileIssues: this.fileIssues(),
        createdAt: new Date(),
        sourceZipFilename: this.importedZipFilename(),
        i18n: this.i18n
      });
      this.downloads.downloadBlob(migrationPackage.filename, migrationPackage.blob);
      this.markSuccessfulExport('zip', migrationPackage.filename);
      this.updateMigrationProgress('done', totalExports, totalExports, migrationPackage.filename, results);
      this.errors.set(this.localizedConversionResults().flatMap((result) => result.errors));
      this.message.set(this.i18n.t('converter.messages.zipDownloaded', { filename: migrationPackage.filename }));
    } finally {
      this.busy.set(false);
    }
  }

  private async classifyFilesInBatches(
    files: InputFile[],
    reportProgress: boolean,
    sourceFilename: string | undefined,
    importSessionId: number
  ): Promise<PolarFileClassificationResult[]> {
    const batches = createWorkerBatches(files);
    const results: PolarFileClassificationResult[] = [];
    let processed = 0;

    for (const batch of batches) {
      if (!this.isCurrentImportSession(importSessionId)) {
        return results;
      }
      if (reportProgress) {
        this.message.set(
          processed === 0
            ? this.i18n.t('converter.messages.classificationStarting')
            : this.i18n.t('converter.messages.classificationProgress', { processed, total: files.length })
        );
        this.importProgress.set({
          stage: 'classifying',
          processedFiles: processed,
          totalFiles: files.length,
          currentPath: batch[0]?.filename ?? sourceFilename
        });
        await waitForVisibleProgress();
        if (!this.isCurrentImportSession(importSessionId)) {
          return results;
        }
      }
      const batchResults = await this.pyodide.classifyFiles(batch);
      if (!this.isCurrentImportSession(importSessionId)) {
        return results;
      }
      results.push(...batchResults);
      processed += batch.length;
      if (reportProgress) {
        this.message.set(this.i18n.t('converter.messages.classificationProgress', { processed, total: files.length }));
        this.importProgress.set({
          stage: 'classifying',
          processedFiles: processed,
          totalFiles: files.length,
          currentPath: batch[batch.length - 1]?.filename ?? sourceFilename
        });
      }
    }

    return results;
  }

  private async analyzeWellnessFilesInBatches(
    files: InputFile[],
    reportProgress: boolean,
    sourceFilename: string | undefined,
    importSessionId: number
  ): Promise<WellnessReport> {
    const batches = createWorkerBatches(files);
    const reports: WellnessReport[] = [];
    let processed = 0;

    for (const batch of batches) {
      if (!this.isCurrentImportSession(importSessionId)) {
        return mergeWellnessReports(reports);
      }
      if (reportProgress) {
        this.message.set(
          processed === 0
            ? this.i18n.t('converter.importProgress.wellnessStarting')
            : this.i18n.t('converter.messages.wellnessProgress', { processed, total: files.length })
        );
        this.importProgress.set({
          stage: 'analyzing_wellness',
          processedFiles: processed,
          totalFiles: files.length,
          currentPath: batch[0]?.filename ?? sourceFilename
        });
        await waitForVisibleProgress();
        if (!this.isCurrentImportSession(importSessionId)) {
          return mergeWellnessReports(reports);
        }
      }
      const report = await this.pyodide.analyzeWellnessFiles(batch);
      if (!this.isCurrentImportSession(importSessionId)) {
        return mergeWellnessReports(reports);
      }
      reports.push(report);
      processed += batch.length;
      if (reportProgress) {
        this.message.set(this.i18n.t('converter.messages.wellnessProgress', { processed, total: files.length }));
        this.importProgress.set({
          stage: 'analyzing_wellness',
          processedFiles: processed,
          totalFiles: files.length,
          currentPath: batch[batch.length - 1]?.filename ?? sourceFilename
        });
      }
    }

    return mergeWellnessReports(reports);
  }

  private resetImportState(): void {
    this.errors.set([]);
    this.files.set([]);
    this.fileIssues.set([]);
    this.importedPolarFiles.set([]);
    this.importProgress.set(null);
    this.importedSource.set(null);
    this.importedZipFilename.set(null);
    this.classifications.set([]);
    this.wellnessReport.set(null);
    this.conversionResults.set([]);
    this.selectedActivityPath.set(null);
    this.activityPreviewCache.set({});
    this.activityPreviewLoadingPath.set(null);
    this.activityPreviewError.set(null);
    this.migrationExportProgress.set(null);
    this.lastSuccessfulExport.set(null);
  }

  private selectFirstActivityPreview(): void {
    this.selectedActivityPath.set(this.activityPreviewCandidates()[0]?.path ?? null);
  }

  private isCurrentImportSession(importSessionId: number): boolean {
    return importSessionId === this.importSessionId;
  }

  private async convertFilesInBatches(
    files: InputFile[],
    convert: (files: InputFile[]) => Promise<ConversionResult[]>,
    label: string
  ): Promise<ConversionResult[]> {
    const batches = createWorkerBatches(files);
    const results: ConversionResult[] = [];
    let processed = 0;

    for (const batch of batches) {
      this.message.set(`${label}: ${processed}/${files.length}...`);
      results.push(...(await convert(batch)));
      processed += batch.length;
    }

    return results;
  }

  private async convertFilesInBatchesWithRecovery(
    files: InputFile[],
    format: ExportFormat,
    convertBatch: (files: InputFile[]) => Promise<ConversionResult[]>,
    convertSingle: (file: InputFile) => Promise<ConversionResult>,
    label: string
  ): Promise<ConversionResult[]> {
    const batches = createWorkerBatches(files);
    const results: ConversionResult[] = [];
    const totalExports = this.migrationExportProgress()?.totalActivities ?? files.length;
    let processedInFormat = 0;

    for (const batch of batches) {
      this.message.set(`${label}: ${processedInFormat}/${files.length}...`);
      this.updateMigrationProgress(
        format === 'tcx' ? 'converting_tcx' : 'converting_fit',
        totalExports,
        this.migrationExportProgress()?.processedActivities ?? 0,
        batch[0]?.filename ?? '',
        this.cumulativeMigrationResults(results)
      );
      try {
        const batchResults = await convertBatch(batch);
        results.push(...batchResults);
        processedInFormat += batch.length;
        this.updateMigrationProgress(
          format === 'tcx' ? 'converting_tcx' : 'converting_fit',
          totalExports,
          Math.min(totalExports, (this.migrationExportProgress()?.processedActivities ?? 0) + batch.length),
          batch[batch.length - 1]?.filename ?? '',
          this.cumulativeMigrationResults(results)
        );
        continue;
      } catch (error) {
        for (const file of batch) {
          try {
            results.push(await convertSingle(file));
          } catch (singleError) {
            results.push(conversionExceptionResult(file, format, singleError, this.i18n));
          }
          processedInFormat += 1;
          this.updateMigrationProgress(
            format === 'tcx' ? 'converting_tcx' : 'converting_fit',
            totalExports,
            Math.min(totalExports, (this.migrationExportProgress()?.processedActivities ?? 0) + 1),
            file.filename,
            this.cumulativeMigrationResults(results)
          );
        }
        const message = error instanceof Error ? error.message : String(error);
        this.errors.update((current) => [...current, this.i18n.t('converter.messages.batchFallback', { label, message })]);
      }
    }

    return results;
  }

  private cumulativeMigrationResults(currentFormatResults: ConversionResult[]): ConversionResult[] {
    return [...this.conversionResults(), ...currentFormatResults];
  }

  private updateMigrationProgress(
    phase: MigrationExportProgress['phase'],
    totalActivities: number,
    processedActivities: number,
    currentFile: string,
    results: ConversionResult[]
  ): void {
    this.migrationExportProgress.set({
      phase,
      totalActivities,
      processedActivities,
      currentFile,
      successes: results.filter((result) => result.status === 'success').length,
      warnings: results.reduce((sum, result) => sum + result.warnings.length, 0),
      errors: results.reduce((sum, result) => sum + result.errors.length, 0)
    });
  }

  private recordMigrationExportSignals(options: MigrationExportOptions): void {
    this.recordBetaSignal('zip_export_clicked');
    if (options.includeTcx) {
      this.recordBetaSignal('tcx_export_clicked');
    }
    if (options.includeFit) {
      this.recordBetaSignal('fit_export_clicked');
    }
    if (options.includeReports || options.includeWellnessReports) {
      this.recordBetaSignal('csv_export_clicked');
    }
  }

  private recordBetaSignal(event: BetaSignalEvent): void {
    this.betaSignals?.increment(event);
  }

  private markSuccessfulExport(kind: SuccessfulExportKind, filename: string): void {
    this.lastSuccessfulExport.set({
      kind,
      filename,
      completedAt: new Date().toISOString()
    });
  }
}

function createWorkerBatches(files: InputFile[]): InputFile[][] {
  const batches: InputFile[][] = [];
  let current: InputFile[] = [];
  let currentSize = 0;

  for (const file of files) {
    const fileSize = estimateWorkerPayloadBytes(file);
    if (
      current.length &&
      (current.length >= MAX_WORKER_BATCH_FILES || currentSize + fileSize > MAX_WORKER_BATCH_PAYLOAD_BYTES)
    ) {
      batches.push(current);
      current = [];
      currentSize = 0;
    }
    current.push(file);
    currentSize += fileSize;
  }

  if (current.length) {
    batches.push(current);
  }

  return batches;
}

function estimateWorkerPayloadBytes(file: InputFile): number {
  return (file.filename.length + file.mimeType.length + file.jsonText.length) * 2 + 128;
}

function ignoredImportToClassification(file: ImportedPolarFile, i18n: I18nService): PolarFileClassification {
  const reason =
    file.kind === 'ignored'
      ? i18n.t('converter.messages.ignoredSystem')
      : i18n.t('converter.messages.ignoredNonJson');
  return {
    path: file.path,
    filename: file.filename,
    sizeBytes: file.sizeBytes,
    category: 'ignored_non_json',
    confidence: 'high',
    reason,
    warnings: file.parseError ? [file.parseError] : [],
    detectedKeys: []
  };
}

function progressMessage(progress: FileLoadProgress, i18n: I18nService): string {
  switch (progress.stage) {
    case 'reading_zip':
      return `${i18n.t('converter.importStages.reading_zip')}...`;
    case 'unzipping':
      return `${i18n.t('converter.importStages.unzipping')}...`;
    case 'scanning_files':
      return i18n.t('converter.messages.zipScanning');
    case 'parsing_json':
      return i18n.t('converter.messages.zipParsing');
    case 'classifying':
      return i18n.t('converter.messages.zipClassifying');
    case 'analyzing_wellness':
      return i18n.t('converter.messages.wellnessAnalysis');
    case 'done':
      return i18n.t('converter.messages.zipReady');
    case 'error':
      return i18n.t('converter.messages.zipImportFailed');
  }
}

function waitForVisibleProgress(): Promise<void> {
  if (typeof requestAnimationFrame === 'function') {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function conversionExceptionResult(file: InputFile, format: ExportFormat, error: unknown, i18n: I18nService): ConversionResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    status: 'error',
    format,
    filename: file.filename.replace(/\.json$/i, `.${format}`),
    mimeType: format === 'tcx' ? 'application/vnd.garmin.tcx+xml' : 'application/vnd.ant.fit',
    content: format === 'tcx' ? '' : new Uint8Array(),
    warnings: [],
    errors: [i18n.t('converter.messages.exportFileFailed', { filename: file.filename, message })]
  };
}

function isActivityPreviewCandidate(item: PolarFileClassificationResult): item is ActivityPreviewCandidate {
  return Boolean(item.activity && item.garminReady);
}

function isGarminExportable(item: PolarFileClassificationResult): boolean {
  if (item.status !== 'ready' || !item.isConvertible) {
    return false;
  }
  const status = item.garminReady?.status;
  return status !== 'error' && status !== 'unsupported';
}

function garminBlockedMessage(item: PolarFileClassificationResult, i18n: I18nService): string {
  const details = item.garminReady?.errors.length
    ? item.garminReady.errors.join(' ')
    : item.garminReady?.message || i18n.t('converter.messages.garminBlockedFallback');
  return i18n.t('converter.messages.garminBlocked', { path: item.path, details });
}

function lookupFallbackTranslation(key: string): TranslationValue | undefined {
  const parts = key.split('.').filter(Boolean);
  let current: TranslationValue | undefined = plTranslations as TranslationValue;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function interpolateFallbackTranslation(value: string, params: TranslationParams | undefined): string {
  if (!params) {
    return value;
  }
  return value.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key: string) => {
    const replacement = params[key];
    return replacement === null || replacement === undefined ? match : String(replacement);
  });
}

function diagnosticFilename(filename: string, extension: 'txt' | 'zip'): string {
  const base = filename.replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'activity';
  return `${base}-garmin-diagnostics.${extension}`;
}
