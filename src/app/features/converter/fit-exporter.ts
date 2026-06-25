import { Decoder, Encoder, Profile, Stream, Utils } from '@garmin/fitsdk';
import {
  ConversionResult,
  GarminReadyFormatValidation,
  GarminReadyReportItem,
  GarminReadyStatus,
  NormalizedActivity,
  NormalizedTrackPoint
} from '@shared/models';
import { mapPolarSportToFit } from './fit-mapping';

interface FitMesg {
  mesgNum: number;
  [key: string]: unknown;
}

interface FitRecord extends FitMesg {
  timestamp: number;
  positionLat?: number;
  positionLong?: number;
  altitude?: number;
  distance?: number;
  heartRate?: number;
  cadence?: number;
  speed?: number;
  enhancedSpeed?: number;
  power?: number;
  temperature?: number;
}

interface PoolSwimPhase {
  startOffsetMillis: number;
  durationMillis: number;
  style?: string;
  strokes?: number;
}

interface PoolSwimLap {
  splitTimeMillis?: number;
  durationMillis?: number;
  distanceMeters?: number;
  poolsSwum?: number;
  strokes?: number;
}

interface PoolSwimMetadata {
  poolLengthMeters?: number;
  poolsSwum?: number;
  totalStrokeCount?: number;
  phases?: PoolSwimPhase[];
  laps?: PoolSwimLap[];
}

interface PoolSwimFitData {
  lengthMessages: FitMesg[];
  lapMessages: FitMesg[];
  sessionFields: Record<string, unknown>;
}

interface PreparedRecords {
  records: FitRecord[];
  warnings: string[];
}

interface FitValidation {
  warnings: string[];
  errors: string[];
  recordCount: number | null;
  decodedMessages?: Record<string, unknown[]>;
}

const FIT_MIME_TYPE = 'application/vnd.ant.fit';
const FIT_DEVICE_SERIAL = 1;
const FIT_DEVICE_PRODUCT = 1;

export function exportActivityToFit(
  activity: NormalizedActivity,
  preExportValidation?: GarminReadyReportItem
): ConversionResult {
  const warnings: string[] = [];
  const polarSport = activity.metadata?.['polarSport'] ?? activity.metadata?.['rawSport'] ?? activity.sport;
  const resolvedSportMapping = mapPolarSportToFit(polarSport);
  const sportMapping = { sport: resolvedSportMapping.sport, subSport: resolvedSportMapping.subSport };
  if (resolvedSportMapping.warning) {
    warnings.push(resolvedSportMapping.warning);
  }
  if (sportMapping.sport === 'swimming' && sportMapping.subSport === 'lapSwimming' && !hasPoolSwimMetadata(activity)) {
    sportMapping.subSport = 'generic';
    warnings.push('Brak danych długości basenu dla FIT lapSwimming. Zapisano aktywność jako swimming/generic.');
  }

  const startTimestamp = toFitTimestamp(activity.startTime);
  if (startTimestamp === null) {
    return fitError(activity, ['Brak poprawnego czasu startu wymaganego przez FIT.'], warnings, preExportValidation);
  }

  const prepared = prepareRecords(activity.trackpoints, warnings);
  warnings.push(...prepared.warnings);
  if (!prepared.records.length) {
    return fitError(
      activity,
      ['Brak poprawnych record messages. FIT wymaga przynajmniej jednego trackpointa.'],
      warnings,
      preExportValidation
    );
  }

  const endTimestamp = prepared.records[prepared.records.length - 1]?.timestamp ?? startTimestamp;
  const totalTimerTime = safeDuration(activity, startTimestamp, endTimestamp);
  const totalDistance = safeNumber(activity.distanceMeters);
  const avgSpeed = deriveAverageSpeed(activity, totalTimerTime);
  const maxSpeed = maxDefined(activity.trackpoints.map((point) => point.speedMps));
  const avgHeartRate = fitInteger(activity.averageHeartRate, 0, 250, 'averageHeartRate', warnings);
  const maxHeartRate = fitInteger(activity.maxHeartRate, 0, 250, 'maxHeartRate', warnings);
  const totalCalories = fitInteger(activity.calories, 0, 65535, 'calories', warnings);
  const genericLapMessage = removeUndefined({
    mesgNum: Profile.MesgNum['LAP'],
    messageIndex: 0,
    timestamp: endTimestamp,
    event: 'lap',
    eventType: 'stop',
    startTime: startTimestamp,
    totalElapsedTime: totalTimerTime,
    totalTimerTime,
    totalDistance,
    totalCalories,
    avgHeartRate,
    maxHeartRate,
    avgSpeed,
    maxSpeed,
    sport: sportMapping.sport,
    subSport: sportMapping.subSport
  });
  const poolSwim = preparePoolSwimFitData(
    activity,
    sportMapping,
    startTimestamp,
    endTimestamp,
    totalTimerTime,
    totalDistance,
    totalCalories,
    avgHeartRate,
    maxHeartRate,
    avgSpeed,
    maxSpeed,
    warnings
  );
  const lapMessages = poolSwim?.lapMessages.length ? poolSwim.lapMessages : [genericLapMessage];
  const lengthMessages = poolSwim?.lengthMessages ?? [];

  const messages: FitMesg[] = [
    {
      mesgNum: Profile.MesgNum['FILE_ID'],
      type: 'activity',
      manufacturer: 'development',
      product: FIT_DEVICE_PRODUCT,
      productName: 'Polar JSON2FIT',
      serialNumber: FIT_DEVICE_SERIAL,
      timeCreated: startTimestamp
    },
    {
      mesgNum: Profile.MesgNum['DEVICE_INFO'],
      deviceIndex: 'creator',
      manufacturer: 'development',
      product: FIT_DEVICE_PRODUCT,
      productName: 'Polar JSON2FIT',
      serialNumber: FIT_DEVICE_SERIAL,
      softwareVersion: 1,
      timestamp: startTimestamp
    },
    {
      mesgNum: Profile.MesgNum['EVENT'],
      timestamp: startTimestamp,
      event: 'timer',
      eventType: 'start'
    },
    ...prepared.records,
    {
      mesgNum: Profile.MesgNum['EVENT'],
      timestamp: endTimestamp,
      event: 'timer',
      eventType: 'stop'
    },
    ...lengthMessages,
    ...lapMessages,
    removeUndefined({
      mesgNum: Profile.MesgNum['SESSION'],
      messageIndex: 0,
      timestamp: endTimestamp,
      event: 'session',
      eventType: 'stop',
      startTime: startTimestamp,
      totalElapsedTime: totalTimerTime,
      totalTimerTime,
      totalDistance,
      totalCalories,
      avgHeartRate,
      maxHeartRate,
      avgSpeed,
      maxSpeed,
      sport: sportMapping.sport,
      subSport: sportMapping.subSport,
      firstLapIndex: 0,
      numLaps: lapMessages.length,
      ...(poolSwim?.sessionFields ?? {})
    }),
    {
      mesgNum: Profile.MesgNum['ACTIVITY'],
      timestamp: endTimestamp,
      numSessions: 1,
      totalTimerTime,
      type: 'manual'
    }
  ];

  try {
    const encoder = new Encoder();
    messages.forEach((message) => encoder.writeMesg(message));
    const content = encoder.close();
    const validation = validateFit(content, prepared.records.length);
    warnings.push(...validation.warnings);
    if (validation.errors.length) {
      return fitError(activity, validation.errors, warnings, preExportValidation, validation);
    }
    return {
      status: 'success',
      format: 'fit',
      filename: fitFilename(activity),
      mimeType: FIT_MIME_TYPE,
      content,
      warnings,
      errors: [],
      activity,
      garminReady: withFitValidation(activity, preExportValidation, validation)
    };
  } catch (error) {
    return fitError(
      activity,
      [`Nie udało się wygenerować FIT: ${error instanceof Error ? error.message : String(error)}`],
      warnings,
      preExportValidation
    );
  }
}

export function degreesToSemicircles(degrees: number): number {
  return Math.round(degrees * (2 ** 31 / 180));
}

export function toFitTimestamp(value: string): number | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return Utils.convertDateToDateTime(date);
}

function prepareRecords(trackpoints: NormalizedTrackPoint[], parentWarnings: string[]): PreparedRecords {
  const warnings: string[] = [];
  const records: FitRecord[] = [];
  const seenTimestamps = new Set<number>();

  for (const trackpoint of [...trackpoints].sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime())) {
    const timestamp = toFitTimestamp(trackpoint.time);
    if (timestamp === null) {
      warnings.push('Pominięto trackpoint bez poprawnego czasu.');
      continue;
    }
    if (seenTimestamps.has(timestamp)) {
      warnings.push(`Pominięto zduplikowany timestamp FIT: ${trackpoint.time}.`);
      continue;
    }
    seenTimestamps.add(timestamp);

    const record: FitRecord = {
      mesgNum: Profile.MesgNum['RECORD'],
      timestamp
    };

    if (hasValidGps(trackpoint)) {
      record.positionLat = degreesToSemicircles(trackpoint.latitude as number);
      record.positionLong = degreesToSemicircles(trackpoint.longitude as number);
    } else if (trackpoint.latitude !== null || trackpoint.longitude !== null) {
      warnings.push('Pominięto nieprawidłowe współrzędne GPS w FIT record.');
    }

    assignNumber(record, 'altitude', trackpoint.altitudeMeters, -500, 10000, 'altitude', warnings);
    assignNumber(record, 'distance', trackpoint.distanceMeters, 0, Number.MAX_SAFE_INTEGER, 'distance', warnings);
    assignInteger(record, 'heartRate', trackpoint.heartRate, 0, 250, 'heartRate', warnings);
    assignInteger(record, 'cadence', trackpoint.cadence, 0, 254, 'cadence', warnings);
    assignNumber(record, 'speed', trackpoint.speedMps, 0, 150, 'speed', warnings);
    assignNumber(record, 'enhancedSpeed', trackpoint.speedMps, 0, 150, 'enhancedSpeed', parentWarnings);
    assignInteger(record, 'power', trackpoint.powerWatts, 0, 65535, 'power', warnings);
    assignInteger(record, 'temperature', trackpoint.temperatureCelsius, -50, 80, 'temperature', warnings);
    records.push(removeUndefined(record));
  }

  return { records, warnings };
}

function preparePoolSwimFitData(
  activity: NormalizedActivity,
  sportMapping: { sport: string; subSport: string },
  startTimestamp: number,
  endTimestamp: number,
  totalTimerTime: number,
  totalDistance: number | undefined,
  totalCalories: number | undefined,
  avgHeartRate: number | undefined,
  maxHeartRate: number | undefined,
  avgSpeed: number | undefined,
  maxSpeed: number | undefined,
  warnings: string[]
): PoolSwimFitData | null {
  if (sportMapping.sport !== 'swimming' || sportMapping.subSport !== 'lapSwimming') {
    return null;
  }

  const metadata = asRecord(activity.metadata?.['swimming']);
  if (!metadata) {
    return null;
  }

  const poolLength = positiveNumber(metadata['poolLengthMeters']);
  const phases = parsePoolSwimPhases(metadata['phases']);
  const phaseStrokeCount = phases.reduce((sum, phase) => sum + (phase.strokes ?? 0), 0);
  const totalStrokes = positiveInteger(metadata['totalStrokeCount']) ?? (phaseStrokeCount > 0 ? phaseStrokeCount : undefined);
  const lengthCount =
    phases.length ||
    positiveInteger(metadata['poolsSwum']) ||
    (poolLength && totalDistance ? Math.round(totalDistance / poolLength) : undefined);

  if (!poolLength && !lengthCount && !totalStrokes) {
    return null;
  }

  const lengthMessages = poolLength ? buildPoolLengthMessages(phases, poolLength, startTimestamp, warnings) : [];
  const lapMessages = buildPoolLapMessages({
    metadata,
    sportMapping,
    startTimestamp,
    endTimestamp,
    totalTimerTime,
    totalDistance,
    totalCalories,
    avgHeartRate,
    maxHeartRate,
    avgSpeed,
    maxSpeed,
    poolLength,
    lengthCount,
    totalStrokes
  });
  const sessionFields = removeUndefined({
    totalCycles: totalStrokes,
    totalStrokes,
    numLengths: lengthCount,
    numActiveLengths: lengthCount,
    avgStrokeCount: totalStrokes && lengthCount ? totalStrokes / lengthCount : undefined,
    avgStrokeDistance: totalDistance && totalStrokes ? totalDistance / totalStrokes : undefined,
    poolLength,
    poolLengthUnit: poolLength ? 'metric' : undefined
  });

  if (!lengthMessages.length && phases.length) {
    warnings.push('Nie udało się zapisać długości basenu w FIT mimo obecności swimmingPhases.');
  }

  return { lengthMessages, lapMessages, sessionFields };
}

function hasPoolSwimMetadata(activity: NormalizedActivity): boolean {
  const metadata = asRecord(activity.metadata?.['swimming']);
  if (!metadata) {
    return false;
  }

  const poolLength = positiveNumber(metadata['poolLengthMeters']);
  const lengthCount = parsePoolSwimPhases(metadata['phases']).length || positiveInteger(metadata['poolsSwum']);
  return poolLength !== undefined && Boolean(lengthCount);
}

function buildPoolLengthMessages(
  phases: PoolSwimPhase[],
  poolLength: number,
  startTimestamp: number,
  warnings: string[]
): FitMesg[] {
  const messages: FitMesg[] = [];
  phases.forEach((phase, index) => {
    const durationSeconds = phase.durationMillis / 1000;
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      warnings.push(`Pominięto nieprawidłową długość basenu FIT: ${phase.durationMillis} ms.`);
      return;
    }
    const startTime = startTimestamp + Math.round(phase.startOffsetMillis / 1000);
    const timestamp = startTimestamp + Math.round((phase.startOffsetMillis + phase.durationMillis) / 1000);
    const totalStrokes = fitInteger(phase.strokes ?? null, 0, 65535, 'swim length strokes', warnings);
    const avgSwimmingCadence = totalStrokes
      ? fitInteger((totalStrokes / durationSeconds) * 60, 0, 254, 'avgSwimmingCadence', warnings)
      : undefined;

    messages.push(
      removeUndefined({
        mesgNum: Profile.MesgNum['LENGTH'],
        messageIndex: index,
        timestamp,
        event: 'length',
        eventType: 'stop',
        startTime,
        totalElapsedTime: durationSeconds,
        totalTimerTime: durationSeconds,
        totalStrokes,
        avgSpeed: poolLength / durationSeconds,
        swimStroke: swimStrokeForPolarStyle(phase.style),
        avgSwimmingCadence,
        lengthType: 'active'
      })
    );
  });
  return messages;
}

function buildPoolLapMessages(args: {
  metadata: Record<string, unknown>;
  sportMapping: { sport: string; subSport: string };
  startTimestamp: number;
  endTimestamp: number;
  totalTimerTime: number;
  totalDistance: number | undefined;
  totalCalories: number | undefined;
  avgHeartRate: number | undefined;
  maxHeartRate: number | undefined;
  avgSpeed: number | undefined;
  maxSpeed: number | undefined;
  poolLength: number | undefined;
  lengthCount: number | undefined;
  totalStrokes: number | undefined;
}): FitMesg[] {
  const laps = parsePoolSwimLaps(args.metadata['laps']);
  if (!laps.length) {
    return [
      enrichedPoolLapMessage({
        messageIndex: 0,
        timestamp: args.endTimestamp,
        startTime: args.startTimestamp,
        totalTimerTime: args.totalTimerTime,
        totalDistance: args.totalDistance,
        totalCalories: args.totalCalories,
        avgHeartRate: args.avgHeartRate,
        maxHeartRate: args.maxHeartRate,
        avgSpeed: args.avgSpeed,
        maxSpeed: args.maxSpeed,
        sportMapping: args.sportMapping,
        firstLengthIndex: 0,
        lengthCount: args.lengthCount,
        totalStrokes: args.totalStrokes
      })
    ];
  }

  let previousSplitSeconds = 0;
  let firstLengthIndex = 0;
  return laps.map((lap, index) => {
    const splitSeconds = millisToSeconds(lap.splitTimeMillis);
    const durationSeconds = millisToSeconds(lap.durationMillis) ?? (splitSeconds !== undefined ? splitSeconds - previousSplitSeconds : undefined);
    const startTime = args.startTimestamp + Math.round(previousSplitSeconds);
    const timestamp = splitSeconds !== undefined ? args.startTimestamp + Math.round(splitSeconds) : startTime + Math.round(durationSeconds ?? 0);
    const lengthCount = lap.poolsSwum ?? (args.poolLength && lap.distanceMeters ? Math.round(lap.distanceMeters / args.poolLength) : undefined);
    const message = enrichedPoolLapMessage({
      messageIndex: index,
      timestamp,
      startTime,
      totalTimerTime: durationSeconds,
      totalDistance: lap.distanceMeters,
      avgSpeed: lap.distanceMeters && durationSeconds && durationSeconds > 0 ? lap.distanceMeters / durationSeconds : undefined,
      sportMapping: args.sportMapping,
      firstLengthIndex,
      lengthCount,
      totalStrokes: lap.strokes
    });
    previousSplitSeconds = splitSeconds ?? previousSplitSeconds + (durationSeconds ?? 0);
    firstLengthIndex += lengthCount ?? 0;
    return message;
  });
}

function enrichedPoolLapMessage(args: {
  messageIndex: number;
  timestamp: number;
  startTime: number;
  totalTimerTime: number | undefined;
  totalDistance: number | undefined;
  totalCalories?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgSpeed?: number;
  maxSpeed?: number;
  sportMapping: { sport: string; subSport: string };
  firstLengthIndex: number;
  lengthCount: number | undefined;
  totalStrokes: number | undefined;
}): FitMesg {
  return removeUndefined({
    mesgNum: Profile.MesgNum['LAP'],
    messageIndex: args.messageIndex,
    timestamp: args.timestamp,
    event: 'lap',
    eventType: 'stop',
    startTime: args.startTime,
    totalElapsedTime: args.totalTimerTime,
    totalTimerTime: args.totalTimerTime,
    totalDistance: args.totalDistance,
    totalCalories: args.totalCalories,
    avgHeartRate: args.avgHeartRate,
    maxHeartRate: args.maxHeartRate,
    avgSpeed: args.avgSpeed,
    maxSpeed: args.maxSpeed,
    sport: args.sportMapping.sport,
    subSport: args.sportMapping.subSport,
    totalCycles: args.totalStrokes,
    totalStrokes: args.totalStrokes,
    numLengths: args.lengthCount,
    numActiveLengths: args.lengthCount,
    firstLengthIndex: args.lengthCount ? args.firstLengthIndex : undefined,
    avgStrokeDistance: args.totalDistance && args.totalStrokes ? args.totalDistance / args.totalStrokes : undefined
  });
}

function parsePoolSwimPhases(value: unknown): PoolSwimPhase[] {
  const phases: PoolSwimPhase[] = [];
  for (const item of asArray(value)) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }
    const startOffsetMillis = nonNegativeNumber(record['startOffsetMillis']);
    const durationMillis = positiveNumber(record['durationMillis']);
    if (startOffsetMillis === undefined || durationMillis === undefined) {
      continue;
    }
    phases.push({
      startOffsetMillis,
      durationMillis,
      style: typeof record['style'] === 'string' ? record['style'] : undefined,
      strokes: positiveInteger(record['strokes'])
    });
  }
  return phases;
}

function parsePoolSwimLaps(value: unknown): PoolSwimLap[] {
  const laps: PoolSwimLap[] = [];
  for (const item of asArray(value)) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }
    const lap = removeUndefined({
      splitTimeMillis: positiveNumber(record['splitTimeMillis']),
      durationMillis: positiveNumber(record['durationMillis']),
      distanceMeters: positiveNumber(record['distanceMeters']),
      poolsSwum: positiveInteger(record['poolsSwum']),
      strokes: positiveInteger(record['strokes'])
    });
    if (Object.keys(lap).length) {
      laps.push(lap);
    }
  }
  return laps;
}

function swimStrokeForPolarStyle(value: string | undefined): string | undefined {
  switch (value?.toUpperCase()) {
    case 'FREESTYLE':
      return 'freestyle';
    case 'BACKSTROKE':
      return 'backstroke';
    case 'BREASTSTROKE':
      return 'breaststroke';
    case 'BUTTERFLY':
      return 'butterfly';
    case 'MIXED':
      return 'mixed';
    default:
      return undefined;
  }
}

function millisToSeconds(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value / 1000 : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function validateFit(content: Uint8Array, expectedRecordCount: number): FitValidation {
  const stream = Stream.fromArrayBuffer(toArrayBuffer(content));
  if (!Decoder.isFIT(stream)) {
    return { warnings: [], errors: ['Wygenerowany plik nie ma poprawnego nagłówka FIT.'], recordCount: null };
  }
  const decoder = new Decoder(Stream.fromArrayBuffer(toArrayBuffer(content)));
  if (!decoder.checkIntegrity()) {
    return {
      warnings: [],
      errors: ['Wygenerowany plik FIT nie przeszedł kontroli integralności CRC.'],
      recordCount: null
    };
  }
  const reader = new Decoder(Stream.fromArrayBuffer(toArrayBuffer(content)));
  const { messages, errors } = reader.read();
  const validationErrors = Array.isArray(errors) ? errors.map(String) : [];
  const decoded = messages as Record<string, unknown[]>;
  if (!decoded['fileIdMesgs']?.length) {
    validationErrors.push('Brak file_id message po dekodowaniu FIT.');
  }
  if (!decoded['activityMesgs']?.length) {
    validationErrors.push('Brak activity message po dekodowaniu FIT.');
  }
  if (!decoded['sessionMesgs']?.length) {
    validationErrors.push('Brak session message po dekodowaniu FIT.');
  }
  if (!decoded['lapMesgs']?.length) {
    validationErrors.push('Brak lap message po dekodowaniu FIT.');
  }
  const decodedRecords = decoded['recordMesgs']?.length ?? 0;
  if (!decodedRecords) {
    validationErrors.push('Brak record messages po dekodowaniu FIT.');
  }
  if (decodedRecords !== expectedRecordCount) {
    validationErrors.push(`Liczba record messages po dekodowaniu (${decodedRecords}) różni się od oczekiwanej (${expectedRecordCount}).`);
  }
  return { warnings: [], errors: validationErrors, recordCount: decodedRecords, decodedMessages: decoded };
}

function hasValidGps(trackpoint: NormalizedTrackPoint): boolean {
  return (
    typeof trackpoint.latitude === 'number' &&
    typeof trackpoint.longitude === 'number' &&
    trackpoint.latitude >= -90 &&
    trackpoint.latitude <= 90 &&
    trackpoint.longitude >= -180 &&
    trackpoint.longitude <= 180
  );
}

function safeDuration(activity: NormalizedActivity, startTimestamp: number, endTimestamp: number): number {
  if (typeof activity.durationSeconds === 'number' && activity.durationSeconds >= 0) {
    return activity.durationSeconds;
  }
  return Math.max(0, endTimestamp - startTimestamp);
}

function deriveAverageSpeed(activity: NormalizedActivity, durationSeconds: number): number | undefined {
  if (typeof activity.distanceMeters === 'number' && activity.distanceMeters >= 0 && durationSeconds > 0) {
    return activity.distanceMeters / durationSeconds;
  }
  return undefined;
}

function maxDefined(values: Array<number | null>): number | undefined {
  const filtered = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return filtered.length ? Math.max(...filtered) : undefined;
}

function safeNumber(value: number | null): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function assignNumber(
  target: FitMesg,
  key: string,
  value: number | null,
  min: number,
  max: number,
  label: string,
  warnings: string[]
): void {
  if (value === null || value === undefined) {
    return;
  }
  if (!Number.isFinite(value) || value < min || value > max) {
    warnings.push(`Pominięto nieprawidłową wartość FIT ${label}: ${value}.`);
    return;
  }
  target[key] = value;
}

function assignInteger(
  target: FitMesg,
  key: string,
  value: number | null,
  min: number,
  max: number,
  label: string,
  warnings: string[]
): void {
  if (value === null || value === undefined) {
    return;
  }
  if (!Number.isFinite(value) || value < min || value > max) {
    warnings.push(`Pominięto nieprawidłową wartość FIT ${label}: ${value}.`);
    return;
  }
  target[key] = Math.round(value);
}

function fitInteger(value: number | null, min: number, max: number, label: string, warnings: string[]): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value) || value < min || value > max) {
    warnings.push(`Pominięto nieprawidłową wartość FIT ${label}: ${value}.`);
    return undefined;
  }
  return Math.round(value);
}

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null)) as T;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function fitFilename(activity: NormalizedActivity): string {
  const start = new Date(activity.startTime);
  const timestamp = Number.isNaN(start.getTime())
    ? ''
    : start.toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  const sport = slug(String(activity.metadata?.['polarSport'] ?? activity.sportDetail ?? activity.sport ?? 'activity'));
  const id = slug(activity.activityId ?? activity.sourceFilename.replace(/\.json$/i, ''));
  return `${timestamp ? `${timestamp}_` : ''}${sport}_${id}.fit`;
}

function fitError(
  activity: NormalizedActivity,
  errors: string[],
  warnings: string[] = [],
  preExportValidation?: GarminReadyReportItem,
  validation?: FitValidation
): ConversionResult {
  return {
    status: 'error',
    format: 'fit',
    filename: fitFilename(activity),
    mimeType: FIT_MIME_TYPE,
    content: new Uint8Array(),
    warnings,
    errors,
    activity,
    garminReady: withFitValidation(activity, preExportValidation, validation ?? { warnings: [], errors, recordCount: null })
  };
}

function withFitValidation(
  activity: NormalizedActivity,
  preExportValidation: GarminReadyReportItem | undefined,
  validation: FitValidation
): GarminReadyReportItem {
  const base = preExportValidation ?? reportFromActivity(activity);
  const formatValidation: GarminReadyFormatValidation = {
    format: 'fit',
    status: statusFor(validation.warnings, validation.errors),
    validationLevel: 'local_sdk',
    recordCount: validation.recordCount,
    warnings: uniqueMessages(validation.warnings),
    errors: uniqueMessages(validation.errors)
  };
  const formatValidations = [
    ...base.formatValidations.filter(
      (item) => item.format !== 'fit' || item.validationLevel === 'pre_export'
    ),
    formatValidation
  ];
  const reportWarnings = uniqueMessages([...base.warnings, ...validation.warnings]);
  const reportErrors = uniqueMessages([...base.errors, ...validation.errors]);
  const status = statusFor(reportWarnings, reportErrors);
  return {
    ...base,
    status,
    message: messageFor(status, reportWarnings, reportErrors),
    possibleFormats: status === 'error' ? [] : uniqueFormats([...base.possibleFormats, 'fit']),
    warnings: reportWarnings,
    errors: reportErrors,
    formatValidations
  };
}

function reportFromActivity(activity: NormalizedActivity): GarminReadyReportItem {
  return {
    path: activity.sourceFilename,
    filename: activity.sourceFilename.split('/').pop() ?? activity.sourceFilename,
    sourceFileKind: activity.sourceFileKind,
    activityId: activity.activityId,
    sport: activity.sport,
    sportDetail: activity.sportDetail,
    startTime: activity.startTime,
    status: 'ready',
    message: 'Gotowe do importu Garmin Connect',
    possibleFormats: ['tcx', 'fit'],
    hasGps: activity.hasGps,
    hasHeartRate: activity.hasHeartRate,
    trackpointCount: activity.trackpointCount,
    warnings: [],
    errors: [],
    formatValidations: []
  };
}

function statusFor(warnings: string[], errors: string[]): GarminReadyStatus {
  if (errors.length) {
    return 'error';
  }
  if (warnings.length) {
    return 'warning';
  }
  return 'ready';
}

function messageFor(status: GarminReadyStatus, warnings: string[], errors: string[]): string {
  if (status === 'ready') {
    return 'Gotowe do importu Garmin Connect';
  }
  if (status === 'warning') {
    return warnings[0] ?? 'Import możliwy z ostrzeżeniami.';
  }
  return errors[0] ?? 'Błąd walidacji Garmin-ready.';
}

function uniqueMessages(messages: string[]): string[] {
  return [...new Set(messages.filter(Boolean))];
}

function uniqueFormats(formats: Array<'tcx' | 'fit'>): Array<'tcx' | 'fit'> {
  return [...new Set(formats)];
}

function slug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'activity';
}
