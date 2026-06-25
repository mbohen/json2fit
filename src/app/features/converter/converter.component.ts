import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideActivity,
  LucideActivitySquare,
  LucideAlertTriangle,
  LucideChevronDown,
  LucideChevronUp,
  LucideDatabase,
  LucideDownload,
  LucideFileArchive,
  LucideFileCode2,
  LucideFileJson,
  LucideFiles,
  LucideFolderOpen,
  LucideHardDriveDownload,
  LucideInfo,
  LucideMonitorDown,
  LucideShieldCheck,
  LucideTrash2,
  LucideUploadCloud,
  LucideWifi,
  LucideWifiOff
} from '@lucide/angular';
import { AppDataService, ClearAppDataResult } from '@app/core/app-data.service';
import { I18nPipe } from '@app/core/i18n/i18n.pipe';
import { I18nService } from '@app/core/i18n/i18n.service';
import { PwaService } from '@app/core/pwa.service';
import { HelpLinkComponent } from '@app/shared/help/help-link.component';
import { SupportButtonComponent } from '@app/shared/support/support-button.component';
import { TermTooltipComponent } from '@app/shared/help/term-tooltip.component';
import { SportDisplayNameService } from '@app/shared/sports/sport-display-name';
import {
  ActivitySummary,
  FileLoadProgress,
  FileLoadProgressStage,
  GarminReadyReportItem,
  GarminReadyStatus,
  ImportedPolarFile,
  ImportedPolarFileKind,
  PolarFileCategory,
  PolarFileClassification,
  PolarFileClassificationResult,
  PolarFileKind
} from '@shared/models';
import { ActivityChartsComponent } from './activity-charts.component';
import { formatPaceSecondsPerKm, isRunningActivity } from './activity-preview.utils';
import { ActivityRoutePreviewComponent } from './activity-route-preview.component';
import { ActivityPreviewCandidate, ClassificationCategorySummary, ConverterStore } from './converter.store';
import { GarminDiagnosticIssue, GpsAnonymizationMode } from './garmin-diagnostics';
import { MigrationExportOptions, MigrationExportPhase } from './migration-package-exporter';

type MigrationExportOptionKey = keyof MigrationExportOptions;

@Component({
  selector: 'app-converter',
  standalone: true,
  imports: [
    CommonModule,
    I18nPipe,
    LucideActivity,
    LucideActivitySquare,
    LucideAlertTriangle,
    LucideChevronDown,
    LucideChevronUp,
    LucideDatabase,
    LucideDownload,
    LucideFileArchive,
    LucideFileCode2,
    LucideFileJson,
    LucideFiles,
    LucideFolderOpen,
    LucideHardDriveDownload,
    LucideInfo,
    LucideMonitorDown,
    LucideShieldCheck,
    LucideTrash2,
    LucideUploadCloud,
    LucideWifi,
    LucideWifiOff,
    RouterLink,
    HelpLinkComponent,
    SupportButtonComponent,
    TermTooltipComponent,
    ActivityRoutePreviewComponent,
    ActivityChartsComponent
  ],
  templateUrl: './converter.component.html',
  styleUrl: './converter.component.css'
})
export class ConverterComponent {
  readonly store = inject(ConverterStore);
  readonly pwa = inject(PwaService);
  readonly i18n = inject(I18nService);
  private readonly sportDisplayNames = inject(SportDisplayNameService);
  readonly expandedFilenames = signal<ReadonlySet<string>>(new Set<string>());
  readonly expandedActivityPreviewPath = signal<string | null>(null);
  readonly clearOfflineCache = signal(false);
  readonly clearDataBusy = signal(false);
  readonly clearDataMessage = signal<string | null>(null);

  private readonly appData = inject(AppDataService);

  onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      void this.store.loadFiles(input.files);
      input.value = '';
    }
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer?.files.length) {
      void this.store.loadFiles(event.dataTransfer.files);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  kindLabel(kind: PolarFileKind): string {
    const translated = this.i18n.t(`polar.kind.${kind}`);
    return translated === `polar.kind.${kind}` ? kind : translated;
  }

  categoryLabel(category: PolarFileCategory): string {
    const translated = this.i18n.t(`polar.category.${category}`);
    return translated === `polar.category.${category}` ? category : translated;
  }

  categoryAction(category: PolarFileCategory): string {
    const key = `polar.actions.${category}`;
    const translated = this.i18n.t(key);
    return translated === key ? this.i18n.t('common.showDetails') : translated;
  }

  confidenceLabel(confidence: 'high' | 'medium' | 'low'): string {
    return this.i18n.t(`converter.confidenceLevels.${confidence}`);
  }

  importedKindLabel(kind: ImportedPolarFileKind): string {
    return this.i18n.t(`converter.importedKind.${kind}`);
  }

  importStageLabel(stage: FileLoadProgressStage): string {
    return this.i18n.t(`converter.importStages.${stage}`);
  }

  importProgressPercent(): number {
    const progress = this.store.importProgress();
    if (!progress || progress.totalFiles <= 0) {
      return 0;
    }
    if (progress.stage === 'done') {
      return 100;
    }
    if (progress.stage !== 'error' && progress.processedFiles === 0) {
      return 3;
    }
    return Math.min(100, Math.round((progress.processedFiles / progress.totalFiles) * 100));
  }

  importProgressDetail(progress: FileLoadProgress): string | null {
    if (progress.stage === 'classifying') {
      return progress.processedFiles === 0
        ? this.i18n.t('converter.importProgress.classificationStarting')
        : this.i18n.t('converter.importProgress.classificationMore');
    }
    if (progress.stage === 'analyzing_wellness') {
      return progress.processedFiles === 0
        ? this.i18n.t('converter.importProgress.wellnessStarting')
        : this.i18n.t('converter.importProgress.wellnessMore');
    }
    if (progress.stage === 'error') {
      return this.store.errors()[0] ?? this.i18n.t('converter.importProgress.errorFallback');
    }
    return null;
  }

  isImportProgressStarting(progress: FileLoadProgress): boolean {
    return this.store.busy() && progress.stage !== 'done' && progress.stage !== 'error' && progress.processedFiles === 0;
  }

  migrationProgressPercent(): number {
    const progress = this.store.migrationExportProgress();
    if (!progress) {
      return 0;
    }
    if (progress.totalActivities <= 0) {
      return progress.phase === 'done' || progress.phase === 'packaging' ? 100 : 0;
    }
    return Math.min(100, Math.round((progress.processedActivities / progress.totalActivities) * 100));
  }

  migrationPhaseLabel(phase: MigrationExportPhase): string {
    return this.i18n.t(`converter.migrationPhases.${phase}`);
  }

  onMigrationOptionChange(option: MigrationExportOptionKey, event: Event): void {
    this.store.setMigrationExportOption(option, (event.target as HTMLInputElement).checked);
  }

  onClearOfflineCacheChange(event: Event): void {
    this.clearOfflineCache.set((event.target as HTMLInputElement).checked);
  }

  async prepareOfflineCache(): Promise<void> {
    await this.pwa.prepareOfflineCache();
  }

  async installApp(): Promise<void> {
    await this.pwa.promptInstall();
  }

  async clearAppData(): Promise<void> {
    this.clearDataBusy.set(true);
    this.clearDataMessage.set(null);
    try {
      const includeOfflineCache = this.clearOfflineCache();
      const result = await this.appData.clearAppData({ includeOfflineCache });
      this.store.clearSession();
      if (includeOfflineCache) {
        this.pwa.markOfflineCacheCleared();
      }
      this.clearDataMessage.set(this.clearDataResultMessage(result));
    } finally {
      this.clearDataBusy.set(false);
    }
  }

  onDiagnosticActivityChange(event: Event): void {
    const path = (event.target as HTMLSelectElement).value;
    if (path) {
      void this.store.selectActivityPreview(path);
    }
  }

  onDiagnosticGpsModeChange(event: Event): void {
    this.store.setDiagnosticGpsMode((event.target as HTMLInputElement).value as GpsAnonymizationMode);
  }

  canDownloadMigrationPackage(): boolean {
    return (
      this.store.migrationExportSelectionValid() &&
      !this.store.busy() &&
      (this.store.classificationReport().length > 0 || this.store.readyToConvert().length > 0 || this.store.wellnessHasData())
    );
  }

  formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024) {
      return `${this.i18n.formatNumber(bytes / 1024 / 1024, { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`;
    }
    if (bytes >= 1024) {
      return `${this.i18n.formatNumber(bytes / 1024, { maximumFractionDigits: 1, minimumFractionDigits: 1 })} KB`;
    }
    return `${this.i18n.formatNumber(bytes)} B`;
  }

  displayFilename(filename: string, key: string, maxLength = 20): string {
    if (this.expandedFilenames().has(key) || filename.length <= maxLength) {
      return filename;
    }
    return `${filename.slice(0, maxLength)}...`;
  }

  displayFilePath(path: string, maxLength = 20): string {
    return this.displayFilename(path, this.filePathKey(path), maxLength);
  }

  filePathExpanded(path: string): boolean {
    return this.expandedFilenames().has(this.filePathKey(path));
  }

  filePathToggleLabel(path: string): string {
    return this.filePathExpanded(path)
      ? this.i18n.t('converter.collapseFilePath', { path })
      : this.i18n.t('converter.expandFilePath', { path });
  }

  toggleFilePath(path: string): void {
    this.toggleFilename(this.filePathKey(path));
  }

  toggleFilename(key: string): void {
    this.expandedFilenames.update((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  fileIssueKey(index: number): string {
    return `file-issue:${index}`;
  }

  filePathKey(path: string): string {
    return `file-path:${path}`;
  }

  formatDuration(seconds: number | null): string {
    if (seconds === null) {
      return this.i18n.t('common.missing');
    }
    const rounded = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    const secs = rounded % 60;
    return [hours, minutes, secs]
      .map((value) => value.toString().padStart(2, '0'))
      .join(':');
  }

  formatDistance(meters: number | null): string {
    if (meters === null) {
      return this.i18n.t('common.missing');
    }
    if (meters >= 1000) {
      return `${this.i18n.formatNumber(meters / 1000, { maximumFractionDigits: 2, minimumFractionDigits: 2 })} km`;
    }
    return `${this.i18n.formatNumber(Math.round(meters))} m`;
  }

  formatCalories(calories: number | null): string {
    return calories === null ? this.i18n.t('common.missing') : `${calories} kcal`;
  }

  formatHeartRate(value: number | null | undefined): string {
    return value === null || value === undefined ? this.i18n.t('common.missing') : `${value} bpm`;
  }

  paceOrSpeedLabel(activity: ActivitySummary): string {
    return isRunningActivity(activity) ? this.i18n.t('converter.avgPace') : this.i18n.t('converter.avgSpeed');
  }

  formatAveragePaceOrSpeed(activity: ActivitySummary): string {
    if (!activity.durationSeconds || !activity.distanceMeters || activity.distanceMeters <= 0) {
      return this.i18n.t('common.missing');
    }
    if (isRunningActivity(activity)) {
      return formatPaceSecondsPerKm(activity.durationSeconds / (activity.distanceMeters / 1000), this.i18n.t('common.missing'));
    }
    return `${this.i18n.formatNumber((activity.distanceMeters / activity.durationSeconds) * 3.6, {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1
    })} km/h`;
  }

  formatDate(value: string): string {
    return this.i18n.formatDate(value, {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  }

  dataBadges(activity: ActivitySummary): string[] {
    return [
      activity.hasGps ? 'GPS' : '',
      activity.hasHeartRate ? 'HR' : '',
      activity.hasCadence ? this.i18n.t('converter.dataBadges.cadence') : '',
      activity.hasPower ? this.i18n.t('converter.dataBadges.power') : ''
    ].filter(Boolean);
  }

  privacyBullets(): readonly string[] {
    return this.i18n.list<string>('converter.privacyBullets');
  }

  displaySport(activity: Pick<ActivitySummary, 'sport' | 'sportDetail'>): string {
    return this.sportDisplayNames.displayActivitySportName(activity);
  }

  displayTcxSport(activity: Pick<ActivitySummary, 'sport'>): string {
    return this.sportDisplayNames.displaySportName(activity.sport);
  }

  showTcxSport(activity: Pick<ActivitySummary, 'sport' | 'sportDetail'>): boolean {
    return this.displayTcxSport(activity) !== this.displaySport(activity);
  }

  isSelectedActivity(item: ActivityPreviewCandidate): boolean {
    return this.store.selectedActivityCandidate()?.path === item.path;
  }

  isActivityPreviewExpanded(item: ActivityPreviewCandidate): boolean {
    return this.expandedActivityPreviewPath() === item.path;
  }

  toggleActivityPreviewCard(item: ActivityPreviewCandidate): void {
    if (this.isActivityPreviewExpanded(item)) {
      this.expandedActivityPreviewPath.set(null);
      return;
    }
    this.expandedActivityPreviewPath.set(item.path);
    void this.store.selectActivityPreview(item.path);
  }

  canExportReportItem(item: PolarFileClassification): boolean {
    const classification = this.classificationForPath(item.path);
    return Boolean(classification && this.canExportClassification(classification));
  }

  canExportClassification(item: PolarFileClassificationResult): boolean {
    const status = item.garminReady?.status;
    return item.status === 'ready' && item.isConvertible && status !== 'error' && status !== 'unsupported';
  }

  garminStatusLabel(status: GarminReadyStatus): string {
    return this.i18n.t(`converter.garminStatus.${status}`);
  }

  garminStatusClasses(status: GarminReadyStatus): string {
    const classes: Record<GarminReadyStatus, string> = {
      ready: 'bg-emerald-100 text-emerald-900',
      warning: 'bg-amber-100 text-amber-900',
      error: 'bg-red-100 text-red-900',
      unsupported: 'bg-slate-100 text-slate-700'
    };
    return classes[status];
  }

  garminStatusSummary(validation: GarminReadyReportItem): string {
    if (validation.status === 'ready') {
      return validation.message;
    }
    if (validation.status === 'warning') {
      return this.i18n.t('converter.garminStatusSummary.warning');
    }
    if (validation.status === 'error') {
      return this.i18n.t('converter.garminStatusSummary.error');
    }
    return this.i18n.t('converter.garminStatusSummary.unsupported');
  }

  yesNo(value: boolean): string {
    return value ? this.i18n.t('common.yes') : this.i18n.t('common.no');
  }

  formatGarminFormats(validation: GarminReadyReportItem): string {
    return validation.possibleFormats.length
      ? validation.possibleFormats.map((format) => format.toUpperCase()).join(', ')
      : this.i18n.t('common.none');
  }

  diagnosticIssueClasses(issue: GarminDiagnosticIssue): string {
    const classes: Record<GarminDiagnosticIssue['severity'], string> = {
      error: 'border-red-200 bg-red-50 text-red-900',
      warning: 'border-amber-200 bg-amber-50 text-amber-900',
      info: 'border-sky-200 bg-sky-50 text-sky-900'
    };
    return classes[issue.severity];
  }

  diagnosticSeverityLabel(issue: GarminDiagnosticIssue): string {
    const labels: Record<GarminDiagnosticIssue['severity'], string> = {
      error: this.i18n.t('common.error'),
      warning: this.i18n.t('common.warning'),
      info: this.i18n.t('common.info')
    };
    return labels[issue.severity];
  }

  exportReportItemTcx(item: PolarFileClassification): void {
    const classification = this.classificationForPath(item.path);
    if (classification) {
      void this.store.exportOneTcx(classification);
    }
  }

  exportReportItemFit(item: PolarFileClassification): void {
    const classification = this.classificationForPath(item.path);
    if (classification) {
      void this.store.exportOneFit(classification);
    }
  }

  trackByFilename(_: number, item: PolarFileClassificationResult): string {
    return item.path;
  }

  trackByActivityPreviewPath(_: number, item: ActivityPreviewCandidate): string {
    return item.path;
  }

  trackByReportPath(_: number, item: PolarFileClassification): string {
    return item.path;
  }

  trackByImportedPath(_: number, item: ImportedPolarFile): string {
    return item.path;
  }

  trackByCategorySummary(_: number, item: ClassificationCategorySummary): string {
    return item.category;
  }

  trackByDiagnosticIssue(_: number, item: GarminDiagnosticIssue): string {
    return item.code;
  }

  private classificationForPath(path: string): PolarFileClassificationResult | undefined {
    return this.store.classifications().find((item) => item.path === path);
  }

  private clearDataResultMessage(result: ClearAppDataResult): string {
    if (result.errors.length) {
      return this.i18n.t('converter.messages.clearDataWarnings', { warnings: result.errors.join(' ') });
    }
    if (result.cachesDeleted.length) {
      return this.i18n.t('converter.messages.clearDataWithCache', { count: result.cachesDeleted.length });
    }
    return this.i18n.t('converter.messages.clearData');
  }
}
