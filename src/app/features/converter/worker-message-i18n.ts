import { I18nService } from '@app/core/i18n/i18n.service';
import {
  ConversionResult,
  GarminReadyFormatValidation,
  GarminReadyReportItem,
  NormalizedActivityResult,
  PolarFileClassificationResult,
  WellnessReport
} from '@shared/models';

type Params = Record<string, string | number>;

interface MessagePattern {
  pattern: RegExp;
  key: string;
  params?: (match: RegExpMatchArray) => Params;
}

const MESSAGE_PATTERNS: readonly MessagePattern[] = [
  { pattern: /^Obsługiwane są tylko pliki JSON\.$/i, key: 'converter.workerMessages.onlyJson' },
  { pattern: /^Nie udało się sparsować JSON\.$/i, key: 'converter.workerMessages.parseJsonFailed' },
  { pattern: /^Plik jest niepoprawnym JSON-em albo nie został wczytany\.$/i, key: 'converter.workerMessages.invalidJson' },
  { pattern: /^Dane konta — pominięte\.$/i, key: 'converter.workerMessages.accountDataSkipped' },
  { pattern: /^Plik może zawierać dane osobowe i nie jest analizowany jako trening\.$/i, key: 'converter.workerMessages.accountDataWarning' },
  { pattern: /^Profil konta — pominięty\.$/i, key: 'converter.workerMessages.accountProfileSkipped' },
  { pattern: /^Plik może zawierać dane profilu i nie jest analizowany jako trening\.$/i, key: 'converter.workerMessages.accountProfileWarning' },
  { pattern: /^Wykryto sesję treningową z osią czasu\.$/i, key: 'converter.workerMessages.trainingSessionDetected' },
  { pattern: /^Plik wygląda na sesję treningową, ale brakuje danych wymaganych do TCX\.$/i, key: 'converter.workerMessages.trainingMissingTcxData' },
  { pattern: /^Aktywność dzienna — poza eksportem sportowym\.$/i, key: 'converter.workerMessages.dailyActivitySkipped' },
  { pattern: /^Pliki activity nie są automatycznie konwertowane bez potwierdzonej struktury treningu\.$/i, key: 'converter.workerMessages.dailyActivityWarning' },
  { pattern: /^Plik wygląda na pomocnicze dane sensora tętna, nie samodzielną aktywność treningową\.$/i, key: 'converter.workerMessages.ohrSensorWarning' },
  { pattern: /^Dane urządzeń — pominięte\.$/i, key: 'converter.workerMessages.productDevicesSkipped' },
  { pattern: /^Plik zawiera metadane urządzeń, nie trening\.$/i, key: 'converter.workerMessages.productDevicesWarning' },
  { pattern: /^Dane snu\/wellness — pominięte\.$/i, key: 'converter.workerMessages.sleepWellnessSkipped' },
  { pattern: /^Plik zawiera wyniki snu lub regeneracji, nie aktywność sportową do Garmin Connect\.$/i, key: 'converter.workerMessages.sleepWellnessWarning' },
  { pattern: /^Profile sportowe — pominięte\.$/i, key: 'converter.workerMessages.sportProfilesSkipped' },
  { pattern: /^Plik zawiera konfigurację profili sportowych, nie pojedynczą sesję treningową\.$/i, key: 'converter.workerMessages.sportProfilesWarning' },
  { pattern: /^Elementy kalendarza — pominięte\.$/i, key: 'converter.workerMessages.calendarItemsSkipped' },
  { pattern: /^Plik zawiera wpisy kalendarza i pomiary pomocnicze, nie pojedynczą aktywność sportową\.$/i, key: 'converter.workerMessages.calendarItemsWarning' },
  {
    pattern: /^(.+): heurystyka po zawartości wykryła jednoznaczną strukturę treningu\.$/i,
    key: 'converter.workerMessages.heuristicTrainingReady',
    params: (match) => ({ prefix: match[1] })
  },
  {
    pattern: /^(.+): heurystyka po zawartości wskazuje trening, ale brakuje danych wymaganych do eksportu\.$/i,
    key: 'converter.workerMessages.heuristicTrainingMissing',
    params: (match) => ({ prefix: match[1] })
  },
  {
    pattern: /^(.+): heurystyka po zawartości wskazuje aktywność dzienną\.$/i,
    key: 'converter.workerMessages.heuristicDailyActivity',
    params: (match) => ({ prefix: match[1] })
  },
  {
    pattern: /^(.+): heurystyka po zawartości wskazuje sen lub wellness\.$/i,
    key: 'converter.workerMessages.heuristicSleepWellness',
    params: (match) => ({ prefix: match[1] })
  },
  {
    pattern: /^(.+): heurystyka po zawartości wskazuje dane konta; plik pominięty\.$/i,
    key: 'converter.workerMessages.heuristicAccountData',
    params: (match) => ({ prefix: match[1] })
  },
  { pattern: /^Nie wykryto czasu startu aktywności\.$/i, key: 'converter.workerMessages.noStartTime' },
  { pattern: /^Brak trackpointów\.$/i, key: 'converter.workerMessages.noTrackpoints' },
  { pattern: /^Brak duration_seconds i nie da się go wyliczyć z trackpointów\.$/i, key: 'converter.workerMessages.missingDuration' },
  {
    pattern: /^duration_seconds nie może być ujemne: (.+) s\.$/i,
    key: 'converter.workerMessages.negativeDuration',
    params: (match) => ({ value: match[1] })
  },
  {
    pattern: /^Dystans aktywności nie może być ujemny: (.+) m\.$/i,
    key: 'converter.workerMessages.negativeDistance',
    params: (match) => ({ value: match[1] })
  },
  { pattern: /^Import możliwy, ale brakuje GPS\.$/i, key: 'converter.workerMessages.missingGps' },
  { pattern: /^Brak tętna\.$/i, key: 'converter.workerMessages.missingHr' },
  {
    pattern: /^Nieznany sport Polar: (.+); użyto fallbacku TCX Other \/ FIT generic\.$/i,
    key: 'converter.workerMessages.unknownSport',
    params: (match) => ({ sport: match[1] })
  },
  { pattern: /^Nie można wyliczyć lap\/session dla Garmin\.$/i, key: 'converter.workerMessages.noLapSession' },
  { pattern: /^TCX Id nie jest datą ISO 8601\.$/i, key: 'converter.workerMessages.tcxIdInvalid' },
  { pattern: /^TCX Lap StartTime nie jest datą ISO 8601\.$/i, key: 'converter.workerMessages.tcxLapInvalid' },
  { pattern: /^TCX nie zawiera Trackpoint mimo trackpointów w aktywności\.$/i, key: 'converter.workerMessages.tcxMissingTrackpoint' },
  { pattern: /^TCX Trackpoint Time nie jest datą ISO 8601\.$/i, key: 'converter.workerMessages.tcxTrackpointTimeInvalid' },
  { pattern: /^Niepoprawne timestampy: trackpointy nie są posortowane po czasie\.$/i, key: 'converter.workerMessages.timestampsUnsorted' },
  { pattern: /^Duplikaty timestampów trackpointów\.$/i, key: 'converter.workerMessages.duplicateTimestamps' },
  { pattern: /^TCX nie zawiera trackpointów\.$/i, key: 'converter.workerMessages.tcxNoTrackpoints' },
  { pattern: /^Import możliwy z ostrzeżeniami\.$/i, key: 'converter.workerMessages.importPossibleWithWarnings' },
  { pattern: /^Nieobsługiwany format JSON\.?$/i, key: 'converter.workerMessages.unsupportedJson' },
  { pattern: /^Błąd walidacji Garmin-ready\.$/i, key: 'converter.workerMessages.garminValidationError' },
  { pattern: /^Brak daty aktywności dziennej; rekord pominięty w CSV\.$/i, key: 'converter.workerMessages.missingDailyActivityDate' },
  { pattern: /^Brak daty snu; rekord pominięty w CSV\.$/i, key: 'converter.workerMessages.missingSleepDate' },
  { pattern: /^Brak daty fazy snu; rekord pominięty w CSV\.$/i, key: 'converter.workerMessages.missingSleepStageDate' },
  { pattern: /^Faza snu bez czasu i długości w źródle\.$/i, key: 'converter.workerMessages.sleepStageMissingTime' },
  { pattern: /^Brak daty Nightly Recharge; rekord pominięty w CSV\.$/i, key: 'converter.workerMessages.missingRechargeDate' },
  { pattern: /^Brak daty dziennego tętna; rekord pominięty w CSV\.$/i, key: 'converter.workerMessages.missingDailyHrDate' },
  { pattern: /^Brak danych długości basenu dla FIT lapSwimming\. Zapisano aktywność jako swimming\/generic\.$/i, key: 'converter.workerMessages.fitMissingPoolLength' },
  {
    pattern: /^Nie udało się wygenerować FIT: (.+)$/i,
    key: 'converter.workerMessages.fitGenerationFailed',
    params: (match) => ({ message: match[1] })
  },
  { pattern: /^Pominięto trackpoint bez poprawnego czasu\.$/i, key: 'converter.workerMessages.fitSkippedInvalidTime' },
  {
    pattern: /^Pominięto zduplikowany timestamp FIT: (.+)\.$/i,
    key: 'converter.workerMessages.fitSkippedDuplicateTimestamp',
    params: (match) => ({ value: match[1] })
  },
  { pattern: /^Pominięto nieprawidłowe współrzędne GPS w FIT record\.$/i, key: 'converter.workerMessages.fitSkippedInvalidGps' },
  { pattern: /^Nie udało się zapisać długości basenu w FIT mimo obecności swimmingPhases\.$/i, key: 'converter.workerMessages.fitPoolLengthWriteFailed' },
  {
    pattern: /^Pominięto nieprawidłową długość basenu FIT: (.+) ms\.$/i,
    key: 'converter.workerMessages.fitSkippedInvalidPoolLength',
    params: (match) => ({ value: match[1] })
  },
  { pattern: /^Wygenerowany plik nie ma poprawnego nagłówka FIT\.$/i, key: 'converter.workerMessages.fitInvalidHeader' },
  { pattern: /^Wygenerowany plik FIT nie przeszedł kontroli integralności CRC\.$/i, key: 'converter.workerMessages.fitInvalidCrc' },
  {
    pattern: /^Liczba record messages po dekodowaniu \((.+)\) różni się od oczekiwanej \((.+)\)\.$/i,
    key: 'converter.workerMessages.fitRecordCountMismatch',
    params: (match) => ({ decoded: match[1], expected: match[2] })
  },
  {
    pattern: /^Pominięto nieprawidłową wartość FIT (.+): (.+)\.$/i,
    key: 'converter.workerMessages.fitSkippedInvalidValue',
    params: (match) => ({ label: match[1], value: match[2] })
  },
  {
    pattern: /^Nieobsługiwany sport Polar dla FIT: (.+)\. Użyto generic\.$/i,
    key: 'converter.workerMessages.fitUnsupportedSport',
    params: (match) => ({ sport: match[1] })
  },
  { pattern: /^Brak sportu Polar dla FIT\. Użyto generic\.$/i, key: 'converter.workerMessages.fitMissingSport' },
  { pattern: /^Nie udało się znormalizować aktywności do FIT\.$/i, key: 'converter.workerMessages.fitNormalizeFailed' },
  { pattern: /^Aktywność nie przeszła walidacji Garmin-ready dla FIT\.$/i, key: 'converter.workerMessages.fitGarminValidationFailed' },
  {
    pattern: /^Pyodide nie zakończyło inicjalizacji przez (.+) s\. Sprawdź, czy hosting poprawnie serwuje assets\/pyodide\/pyodide\.asm\.wasm jako application\/wasm\.$/i,
    key: 'converter.workerMessages.pyodideTimeout',
    params: (match) => ({ seconds: match[1] })
  },
  {
    pattern: /^Nie udało się zainicjalizować Pyodide z (.+): (.+)$/i,
    key: 'converter.workerMessages.pyodideInitFailed',
    params: (match) => ({ url: match[1], error: match[2] })
  },
  {
    pattern: /^Nie udało się załadować modułu Python (.+) z (.+) \((.+)\)\.$/i,
    key: 'converter.workerMessages.pythonModuleLoadFailed',
    params: (match) => ({ filename: match[1], url: match[2], status: match[3] })
  },
  {
    pattern: /^Hosting zwrócił HTML zamiast modułu Python (.+): (.+)$/i,
    key: 'converter.workerMessages.htmlInsteadPythonModule',
    params: (match) => ({ filename: match[1], url: match[2] })
  },
  {
    pattern: /^Nie udało się pobrać (.+) z (.+) \((.+)\)\.$/i,
    key: 'converter.workerMessages.assetDownloadFailed',
    params: (match) => ({ filename: match[1], url: match[2], status: match[3] })
  },
  {
    pattern: /^Hosting zwrócił HTML zamiast (.+): (.+)$/i,
    key: 'converter.workerMessages.htmlInsteadAsset',
    params: (match) => ({ filename: match[1], url: match[2] })
  },
  {
    pattern: /^Hosting serwuje (.+) jako "(.+)", a Pyodide wymaga "(.+)"\. Dla Apache dodaj: AddType application\/wasm \.wasm, a potem wyczyść stary service worker\/cache przeglądarki\.$/i,
    key: 'converter.workerMessages.wasmMimeInvalid',
    params: (match) => ({ filename: match[1], received: match[2], required: match[3] })
  },
  {
    pattern: /^Plik (.+) z (.+) wygląda na ucięty \((.+) B\)\. Wdróż ponownie pełny katalog assets\/pyodide\.$/i,
    key: 'converter.workerMessages.assetTruncated',
    params: (match) => ({ filename: match[1], url: match[2], bytes: match[3] })
  },
  {
    pattern: /^Nie udało się załadować Pyodide z (.+) ani (.+): (.+); fallback: (.+)$/i,
    key: 'converter.workerMessages.pyodideLoadFailed',
    params: (match) => ({ moduleUrl: match[1], fallbackUrl: match[2], error: match[3], fallbackError: match[4] })
  },
  {
    pattern: /^Plik Pyodide nie udostępnia loadPyodide: (.+)$/i,
    key: 'converter.workerMessages.pyodideNoLoadFunction',
    params: (match) => ({ moduleUrl: match[1] })
  }
];

export function localizeClassificationResult(item: PolarFileClassificationResult, i18n: I18nService): PolarFileClassificationResult {
  return {
    ...item,
    reason: translateWorkerMessage(item.reason, i18n),
    warnings: item.warnings.map((warning) => translateWorkerMessage(warning, i18n)),
    garminReady: item.garminReady ? localizeGarminReadyReportItem(item.garminReady, i18n) : undefined
  };
}

export function localizeConversionResult(result: ConversionResult, i18n: I18nService): ConversionResult {
  return {
    ...result,
    warnings: result.warnings.map((warning) => translateWorkerMessage(warning, i18n)),
    errors: result.errors.map((error) => translateWorkerMessage(error, i18n)),
    garminReady: result.garminReady ? localizeGarminReadyReportItem(result.garminReady, i18n) : undefined
  };
}

export function localizeNormalizedActivityResult(result: NormalizedActivityResult, i18n: I18nService): NormalizedActivityResult {
  return {
    ...result,
    warnings: result.warnings.map((warning) => translateWorkerMessage(warning, i18n)),
    errors: result.errors.map((error) => translateWorkerMessage(error, i18n)),
    garminReady: result.garminReady ? localizeGarminReadyReportItem(result.garminReady, i18n) : undefined
  };
}

export function localizeWellnessReport(report: WellnessReport, i18n: I18nService): WellnessReport {
  return {
    ...report,
    warnings: report.warnings.map((warning) => translateWorkerMessage(warning, i18n)),
    dailyActivity: report.dailyActivity.map((record) => ({ ...record, warnings: record.warnings.map((warning) => translateWorkerMessage(warning, i18n)) })),
    sleepSummaries: report.sleepSummaries.map((record) => ({ ...record, warnings: record.warnings.map((warning) => translateWorkerMessage(warning, i18n)) })),
    sleepStages: report.sleepStages.map((record) => ({ ...record, warnings: record.warnings.map((warning) => translateWorkerMessage(warning, i18n)) })),
    nightlyRecharge: report.nightlyRecharge.map((record) => ({ ...record, warnings: record.warnings.map((warning) => translateWorkerMessage(warning, i18n)) })),
    dailyHeartRate: report.dailyHeartRate.map((record) => ({ ...record, warnings: record.warnings.map((warning) => translateWorkerMessage(warning, i18n)) })),
    undatedRecords: report.undatedRecords.map((record) => ({ ...record, warnings: record.warnings.map((warning) => translateWorkerMessage(warning, i18n)) })),
    skippedRecords: report.skippedRecords.map((record) => ({ ...record, warnings: record.warnings.map((warning) => translateWorkerMessage(warning, i18n)) }))
  };
}

export function translateWorkerMessage(message: string, i18n: I18nService): string {
  for (const definition of MESSAGE_PATTERNS) {
    const match = message.match(definition.pattern);
    if (!match) {
      continue;
    }
    const translated = i18n.t(definition.key, definition.params?.(match));
    return translated === definition.key ? message : translated;
  }
  return message;
}

function localizeGarminReadyReportItem(item: GarminReadyReportItem, i18n: I18nService): GarminReadyReportItem {
  return {
    ...item,
    message: translateWorkerMessage(item.message, i18n),
    warnings: item.warnings.map((warning) => translateWorkerMessage(warning, i18n)),
    errors: item.errors.map((error) => translateWorkerMessage(error, i18n)),
    formatValidations: item.formatValidations.map((validation) => localizeGarminFormatValidation(validation, i18n))
  };
}

function localizeGarminFormatValidation(validation: GarminReadyFormatValidation, i18n: I18nService): GarminReadyFormatValidation {
  return {
    ...validation,
    warnings: validation.warnings.map((warning) => translateWorkerMessage(warning, i18n)),
    errors: validation.errors.map((error) => translateWorkerMessage(error, i18n))
  };
}
