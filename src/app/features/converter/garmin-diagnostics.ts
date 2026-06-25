import { GarminReadyReportItem, NormalizedActivity, NormalizedTrackPoint } from '@shared/models';
import { I18nService } from '@app/core/i18n/i18n.service';
import { displayActivitySportName } from '@app/shared/sports/sport-display-name';

export type GpsAnonymizationMode = 'none' | 'rounded' | 'full';

export interface GarminDiagnosticIssue {
  code: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  detail: string;
  suggestion: string;
}

export interface GarminDiagnosticGpsPoint {
  time: string;
  latitude: number | null;
  longitude: number | null;
}

export interface GarminDiagnosticReport {
  fileName: string;
  sourceFile: string;
  format: string;
  exporterVersion: string;
  validationStatus: string;
  startTime: string | null;
  duration: number | null;
  distance: number | null;
  sportMapping: string;
  trackpointsCount: number;
  gpsPointsCount: number;
  hrPointsCount: number;
  warnings: string[];
  errors: string[];
  issues: GarminDiagnosticIssue[];
  gpsMode: GpsAnonymizationMode;
  gpsPoints: GarminDiagnosticGpsPoint[];
}

export const JSON2FIT_EXPORTER_VERSION = '0.1.0';

const TYPICAL_PROBLEMS: Array<{
  code: string;
  severity: GarminDiagnosticIssue['severity'];
  patterns: RegExp[];
  title: string;
  detail: string;
  suggestion: string;
}> = [
  {
    code: 'missing-start-time',
    severity: 'error',
    patterns: [/brak start_time/i, /brak poprawnego czasu startu/i],
    title: 'Brak czasu startu',
    detail: 'Garmin wymaga jednoznacznego czasu rozpoczęcia aktywności.',
    suggestion: 'Sprawdź, czy źródłowy JSON zawiera czas startu treningu. Bez tej wartości aplikacja nie powinna dopisywać sztucznej daty.'
  },
  {
    code: 'missing-fit-session-lap',
    severity: 'error',
    patterns: [/brak session message/i, /brak lap message/i, /nie można wyliczyć lap\/session/i],
    title: 'Brak session/lap',
    detail: 'FIT i TCX potrzebują podsumowania sesji oraz okrążenia, aby Garmin mógł zbudować aktywność.',
    suggestion: 'Spróbuj TCX, jeśli problem dotyczy FIT. Jeśli brakuje czasu startu lub czasu trwania, zachowaj raport do analizy parsera.'
  },
  {
    code: 'missing-tcx-activity-id',
    severity: 'error',
    patterns: [/tcx nie zawiera id/i, /tcx id nie jest datą/i],
    title: 'Brak Activity/Id w TCX',
    detail: 'Garmin Connect zwykle oczekuje, że TCX Activity/Id będzie poprawną datą ISO.',
    suggestion: 'Wygeneruj plik ponownie po sprawdzeniu czasu startu. Jeśli błąd wraca, użyj raportu diagnostycznego jako regresji.'
  },
  {
    code: 'missing-trackpoints',
    severity: 'error',
    patterns: [/brak trackpoint/i, /brak record messages/i, /nie zawiera trackpoint/i],
    title: 'Brak trackpointów',
    detail: 'Plik bez rekordów czasu ma bardzo małą szansę importu do Garmin Connect.',
    suggestion: 'Nie importuj tej aktywności sportowo, dopóki parser nie znajdzie osi czasu treningu w źródłowym JSON.'
  },
  {
    code: 'invalid-timestamps',
    severity: 'error',
    patterns: [/niepoprawne timestamp/i, /nie są posortowane po czasie/i, /bez poprawnego czasu/i],
    title: 'Niepoprawne timestampy',
    detail: 'Garmin może odrzucić aktywność, jeżeli punkty mają brakujące, błędne albo cofające się czasy.',
    suggestion: 'Spróbuj alternatywnego formatu. Jeżeli oba formaty są blokowane, potrzebny jest zanonimizowany przykład źródłowy do poprawy parsera.'
  },
  {
    code: 'duplicate-timestamps',
    severity: 'error',
    patterns: [/duplikaty timestamp/i, /zduplikowany timestamp/i],
    title: 'Duplikaty timestampów',
    detail: 'Powtarzające się czasy trackpointów mogą uszkodzić import albo skrócić aktywność.',
    suggestion: 'FIT exporter pomija duplikaty, ale jeśli Garmin nadal odrzuca plik, spróbuj TCX i dołącz raport diagnostyczny.'
  },
  {
    code: 'invalid-gps',
    severity: 'error',
    patterns: [/nieprawidłowa szerokość/i, /nieprawidłowa długość/i, /nieprawidłowe współrzędne/i, /gps/i],
    title: 'Współrzędne GPS poza zakresem',
    detail: 'Szerokość musi mieścić się w zakresie -90..90, a długość -180..180.',
    suggestion: 'Eksport powinien pominąć błędne punkty GPS zamiast je naprawiać. Pobierz raport bez pełnej trasy albo z GPS zaokrąglonym.'
  },
  {
    code: 'invalid-time-format',
    severity: 'error',
    patterns: [/nie jest datą iso/i, /format czasu/i],
    title: 'Niepoprawny format czasu',
    detail: 'Garmin oczekuje dat możliwych do odczytania jako ISO 8601.',
    suggestion: 'Wygeneruj ponownie plik po poprawie mapowania czasu w parserze.'
  },
  {
    code: 'fit-crc-structure',
    severity: 'error',
    patterns: [/crc/i, /integralności/i, /nagłówka fit/i, /nie udało się wygenerować fit/i],
    title: 'FIT ma błędną strukturę lub CRC',
    detail: 'Lokalny decoder FIT wykrył problem z binarną strukturą pliku.',
    suggestion: 'Użyj TCX dla tej aktywności i zachowaj raport. FIT pozostaje eksportem lokalnym eksperymentalnym.'
  },
  {
    code: 'sport-mapping',
    severity: 'warning',
    patterns: [/nieznany sport/i, /fallbacku/i, /sport/i, /subsport/i],
    title: 'Niepewne mapowanie sportu',
    detail: 'Garmin Connect może zaimportować aktywność jako ogólny sport lub zmienić subsport.',
    suggestion: 'Po imporcie sprawdź typ aktywności w Garmin Connect. TCX ma mniejszy zestaw sportów niż FIT.'
  },
  {
    code: 'numeric-range',
    severity: 'error',
    patterns: [/poza realistycznym zakresem/i, /nie może być ujemn/i, /pominięto nieprawidłową wartość fit/i],
    title: 'Wartości liczbowe poza zakresem',
    detail: 'Niektóre pola liczbowe są ujemne, zbyt duże albo nieobsługiwane przez FIT/TCX.',
    suggestion: 'Eksporter powinien pominąć pola opcjonalne poza zakresem, a błędy krytyczne zostawić widoczne w raporcie.'
  },
  {
    code: 'missing-gps',
    severity: 'warning',
    patterns: [/brakuje gps/i],
    title: 'Brak GPS',
    detail: 'Brak GPS zwykle nie blokuje importu, ale aktywność nie będzie miała mapy.',
    suggestion: 'Importuj jako aktywność czasową albo spróbuj drugiego formatu, jeśli Garmin pokazuje niepełny import.'
  },
  {
    code: 'mime-hosting',
    severity: 'info',
    patterns: [/mime/i, /application\/wasm/i],
    title: 'MIME hostingu dotyczy aplikacji, nie pliku wynikowego',
    detail: 'Błędny MIME dla WASM może uniemożliwić uruchomienie aplikacji, ale nie jest przyczyną odrzucenia gotowego FIT/TCX.',
    suggestion: 'Jeśli aplikacja działa i pobiera plik, diagnozuj strukturę aktywności oraz walidację FIT/TCX.'
  }
];

export function createGarminDiagnosticReport(input: {
  validation: GarminReadyReportItem;
  activity?: NormalizedActivity | null;
  gpsMode?: GpsAnonymizationMode;
  exporterVersion?: string;
  i18n?: I18nService;
  sportMappingLabel?: string;
}): GarminDiagnosticReport {
  const gpsMode = input.gpsMode ?? 'none';
  const validation = input.validation;
  const activity = input.activity ?? null;
  const trackpoints = activity?.trackpoints ?? [];
  const warnings = uniqueMessages([
    ...validation.warnings,
    ...validation.formatValidations.flatMap((item) => item.warnings)
  ]);
  const errors = uniqueMessages([
    ...validation.errors,
    ...validation.formatValidations.flatMap((item) => item.errors)
  ]);

  return {
    fileName: validation.filename,
    sourceFile: validation.path,
    format: validation.possibleFormats.length ? validation.possibleFormats.map((format) => format.toUpperCase()).join(', ') : 'brak',
    exporterVersion: input.exporterVersion ?? JSON2FIT_EXPORTER_VERSION,
    validationStatus: validation.status,
    startTime: validation.startTime,
    duration: activity?.durationSeconds ?? null,
    distance: activity?.distanceMeters ?? null,
    sportMapping: input.sportMappingLabel ?? displayActivitySportName(validation),
    trackpointsCount: validation.trackpointCount,
    gpsPointsCount: countGpsPoints(trackpoints, validation),
    hrPointsCount: countHrPoints(trackpoints, validation),
    warnings,
    errors,
    issues: diagnoseGarminIssues(validation, input.i18n),
    gpsMode,
    gpsPoints: anonymizeGpsPoints(trackpoints, gpsMode)
  };
}

export function diagnoseGarminIssues(validation: GarminReadyReportItem, i18n?: I18nService): GarminDiagnosticIssue[] {
  const messages = [
    validation.message,
    ...validation.warnings,
    ...validation.errors,
    ...validation.formatValidations.flatMap((item) => [...item.warnings, ...item.errors])
  ];
  const found = TYPICAL_PROBLEMS.filter((problem) =>
    messages.some((message) => problem.patterns.some((pattern) => pattern.test(message)))
  ).map(({ code, severity, title, detail, suggestion }) => ({
    code,
    severity,
    title: i18nText(i18n, code, 'title', title),
    detail: i18nText(i18n, code, 'detail', detail),
    suggestion: i18nText(i18n, code, 'suggestion', suggestion)
  }));

  if (!found.length && validation.status === 'ready') {
    found.push({
      code: 'garmin-business-rules',
      severity: 'info',
      title: i18nText(i18n, 'garmin-business-rules', 'title', 'Lokalna walidacja jest poprawna'),
      detail: i18nText(
        i18n,
        'garmin-business-rules',
        'detail',
        'Plik spełnia lokalne kontrole, ale Garmin Connect może mieć dodatkowe reguły biznesowe.'
      ),
      suggestion: i18nText(
        i18n,
        'garmin-business-rules',
        'suggestion',
        'Spróbuj drugiego formatu TCX/FIT i porównaj import ze statystykami w raporcie.'
      )
    });
  }

  return uniqueIssues(found);
}

export function diagnosticReportToText(report: GarminDiagnosticReport, i18n?: I18nService): string {
  const missing = i18n?.t('common.none') ?? 'brak';
  return [
    `File name: ${report.fileName}`,
    `Source file: ${report.sourceFile}`,
    `Format: ${report.format}`,
    `Exporter version: ${report.exporterVersion}`,
    `Validation status: ${report.validationStatus}`,
    `Start time: ${report.startTime ?? missing}`,
    `Duration: ${formatNullableNumber(report.duration, 's', missing)}`,
    `Distance: ${formatNullableNumber(report.distance, 'm', missing)}`,
    `Sport mapping: ${report.sportMapping}`,
    `Trackpoints count: ${report.trackpointsCount}`,
    `GPS points count: ${report.gpsPointsCount}`,
    `HR points count: ${report.hrPointsCount}`,
    `Warnings: ${report.warnings.length ? report.warnings.join('; ') : missing}`,
    `Errors: ${report.errors.length ? report.errors.join('; ') : missing}`,
    '',
    i18n?.t('diagnostics.textReport.diagnosis') ?? 'Diagnosis:',
    ...(report.issues.length
      ? report.issues.map((issue) => `- [${issue.severity}] ${issue.title}: ${issue.suggestion}`)
      : [i18n?.t('diagnostics.textReport.noDiagnosis') ?? '- brak diagnoz']),
    '',
    i18n?.t('diagnostics.textReport.gpsPrivacyMode', { mode: gpsModeLabel(report.gpsMode, i18n) }) ??
      `GPS privacy mode: ${gpsModeLabel(report.gpsMode, i18n)}`,
    ...(report.gpsPoints.length
      ? [i18n?.t('diagnostics.textReport.gpsSample') ?? 'GPS sample:', ...report.gpsPoints.map((point) => `- ${point.time}: ${point.latitude}, ${point.longitude}`)]
      : [i18n?.t('diagnostics.textReport.gpsSampleEmpty') ?? 'GPS sample: brak'])
  ].join('\n');
}

export function anonymizeGpsPoints(
  trackpoints: NormalizedTrackPoint[],
  mode: GpsAnonymizationMode
): GarminDiagnosticGpsPoint[] {
  if (mode === 'none') {
    return [];
  }
  return trackpoints
    .filter((point) => typeof point.latitude === 'number' && typeof point.longitude === 'number')
    .slice(0, 20)
    .map((point) => ({
      time: point.time,
      latitude: mode === 'rounded' ? roundGps(point.latitude as number) : (point.latitude as number),
      longitude: mode === 'rounded' ? roundGps(point.longitude as number) : (point.longitude as number)
    }));
}

function countGpsPoints(trackpoints: NormalizedTrackPoint[], validation: GarminReadyReportItem): number {
  if (trackpoints.length) {
    return trackpoints.filter((point) => typeof point.latitude === 'number' && typeof point.longitude === 'number').length;
  }
  return validation.hasGps ? validation.trackpointCount : 0;
}

function countHrPoints(trackpoints: NormalizedTrackPoint[], validation: GarminReadyReportItem): number {
  if (trackpoints.length) {
    return trackpoints.filter((point) => typeof point.heartRate === 'number').length;
  }
  return validation.hasHeartRate ? validation.trackpointCount : 0;
}

function formatNullableNumber(value: number | null, unit: string, missing: string): string {
  return value === null ? missing : `${value} ${unit}`;
}

function gpsModeLabel(mode: GpsAnonymizationMode, i18n?: I18nService): string {
  const labels: Record<GpsAnonymizationMode, string> = {
    none: i18n?.t('diagnostics.textReport.none') ?? 'bez GPS',
    rounded: i18n?.t('diagnostics.textReport.rounded') ?? 'GPS zaokrąglone',
    full: i18n?.t('diagnostics.textReport.full') ?? 'pełne GPS'
  };
  return labels[mode];
}

function i18nText(i18n: I18nService | undefined, code: string, field: 'title' | 'detail' | 'suggestion', fallback: string): string {
  const key = `diagnostics.issues.${code}.${field}`;
  const translated = i18n?.t(key);
  return translated && translated !== key ? translated : fallback;
}

function roundGps(value: number): number {
  return Number(value.toFixed(3));
}

function uniqueMessages(messages: string[]): string[] {
  return [...new Set(messages.filter(Boolean))];
}

function uniqueIssues(issues: GarminDiagnosticIssue[]): GarminDiagnosticIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    if (seen.has(issue.code)) {
      return false;
    }
    seen.add(issue.code);
    return true;
  });
}
