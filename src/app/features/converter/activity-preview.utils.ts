import { NormalizedActivity, NormalizedTrackPoint } from '@shared/models';
import { projectRouteToSvg } from '@shared/gps/route-svg-projection';

export const MAX_ROUTE_PREVIEW_POINTS = 1000;
export const MAX_CHART_PREVIEW_POINTS = 400;

export interface RoutePreviewModel {
  hasGps: boolean;
  polyline: string;
  totalGpsPoints: number;
  renderedGpsPoints: number;
}

export interface ChartPreviewModel {
  id: string;
  title: string;
  unit: string;
  hasData: boolean;
  polyline: string;
  minLabel: string;
  maxLabel: string;
  totalPoints: number;
  renderedPoints: number;
  emptyLabel: string;
}

export interface ActivityChartLabels {
  pace: string;
  speed: string;
  heartRate: string;
  altitude: string;
  cadence: string;
  power: string;
  emptyPace: string;
  emptySpeed: string;
  emptyHeartRate: string;
  emptyAltitude: string;
  emptyCadence: string;
  emptyPower: string;
  missing: string;
}

interface ChartSample {
  time: number;
  value: number;
}

const SVG_WIDTH = 640;
const SVG_HEIGHT = 220;
const SVG_PADDING = 16;

const DEFAULT_CHART_LABELS: ActivityChartLabels = {
  pace: 'Pace',
  speed: 'Speed',
  heartRate: 'Heart rate',
  altitude: 'Altitude',
  cadence: 'Cadence',
  power: 'Power',
  emptyPace: 'No pace data',
  emptySpeed: 'No speed data',
  emptyHeartRate: 'No heart-rate data',
  emptyAltitude: 'No altitude data',
  emptyCadence: 'No cadence data',
  emptyPower: 'No power data',
  missing: 'missing'
};

export function downsampleForPreview<T>(items: readonly T[], maxPoints: number): T[] {
  if (maxPoints <= 0 || !items.length) {
    return [];
  }
  if (items.length <= maxPoints) {
    return [...items];
  }
  if (maxPoints === 1) {
    return [items[0]];
  }

  const lastIndex = items.length - 1;
  const selectedIndexes = new Set<number>();
  for (let index = 0; index < maxPoints; index += 1) {
    selectedIndexes.add(Math.round((index * lastIndex) / (maxPoints - 1)));
  }
  selectedIndexes.add(0);
  selectedIndexes.add(lastIndex);

  return [...selectedIndexes]
    .sort((left, right) => left - right)
    .map((index) => items[index]);
}

export function buildRoutePreview(
  trackpoints: readonly NormalizedTrackPoint[],
  maxPoints = MAX_ROUTE_PREVIEW_POINTS
): RoutePreviewModel {
  const gpsPoints = trackpoints.filter(hasGpsCoordinates);
  const renderedPoints = downsampleForPreview(gpsPoints, maxPoints);
  const allCoordinates = gpsPoints.map((point) => ({
    latitude: point.latitude as number,
    longitude: point.longitude as number
  }));
  const renderedCoordinates = renderedPoints.map((point) => ({
    latitude: point.latitude as number,
    longitude: point.longitude as number
  }));

  return {
    hasGps: gpsPoints.length > 0,
    polyline: projectRouteToSvg(allCoordinates, renderedCoordinates, {
      width: SVG_WIDTH,
      height: SVG_HEIGHT,
      padding: SVG_PADDING
    }).polyline,
    totalGpsPoints: gpsPoints.length,
    renderedGpsPoints: renderedPoints.length
  };
}

export function buildActivityCharts(activity: NormalizedActivity | null, labels: ActivityChartLabels = DEFAULT_CHART_LABELS): ChartPreviewModel[] {
  if (!activity) {
    return [];
  }

  const speedChart = isRunningActivity(activity)
    ? createChart(
        'pace',
        labels.pace,
        'min/km',
        paceSamples(activity.trackpoints),
        (value) => formatPaceSecondsPerKm(value, labels.missing),
        labels.emptyPace
      )
    : createChart(
        'speed',
        labels.speed,
        'km/h',
        speedSamples(activity.trackpoints),
        (value) => `${value.toFixed(1)} km/h`,
        labels.emptySpeed
      );

  const baseCharts = [
    createChart(
      'heart-rate',
      labels.heartRate,
      'bpm',
      numericSamples(activity.trackpoints, (point) => point.heartRate),
      (value) => `${Math.round(value)} bpm`,
      labels.emptyHeartRate
    ),
    speedChart,
    createChart(
      'altitude',
      labels.altitude,
      'm',
      numericSamples(activity.trackpoints, (point) => point.altitudeMeters),
      (value) => `${Math.round(value)} m`,
      labels.emptyAltitude
    )
  ];

  const optionalCharts = [
    createChart(
      'cadence',
      labels.cadence,
      'rpm',
      numericSamples(activity.trackpoints, (point) => point.cadence),
      (value) => `${Math.round(value)} rpm`,
      labels.emptyCadence
    ),
    createChart(
      'power',
      labels.power,
      'W',
      numericSamples(activity.trackpoints, (point) => point.powerWatts),
      (value) => `${Math.round(value)} W`,
      labels.emptyPower
    )
  ].filter((chart) => chart.hasData);

  return [...baseCharts, ...optionalCharts];
}

export function formatPaceSecondsPerKm(value: number, missingLabel = DEFAULT_CHART_LABELS.missing): string {
  if (!Number.isFinite(value) || value <= 0) {
    return missingLabel;
  }
  const rounded = Math.round(value);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')} min/km`;
}

export function isRunningActivity(activity: Pick<NormalizedActivity, 'sport' | 'sportDetail'>): boolean {
  const sport = `${activity.sport} ${activity.sportDetail ?? ''}`.toLowerCase();
  return sport.includes('run') || sport.includes('bieg');
}

function createChart(
  id: string,
  title: string,
  unit: string,
  samples: ChartSample[],
  formatValue: (value: number) => string,
  emptyLabel: string
): ChartPreviewModel {
  const renderedSamples = downsampleForPreview(samples, MAX_CHART_PREVIEW_POINTS);
  const values = renderedSamples.map((sample) => sample.value);
  const min = Math.min(...values);
  const max = Math.max(...values);

  return {
    id,
    title,
    unit,
    hasData: renderedSamples.length > 0,
    polyline: samplesToPolyline(renderedSamples),
    minLabel: renderedSamples.length ? formatValue(min) : '',
    maxLabel: renderedSamples.length ? formatValue(max) : '',
    totalPoints: samples.length,
    renderedPoints: renderedSamples.length,
    emptyLabel
  };
}

function numericSamples(
  trackpoints: readonly NormalizedTrackPoint[],
  valueFor: (point: NormalizedTrackPoint) => number | null
): ChartSample[] {
  return trackpoints
    .map((point) => ({
      time: Date.parse(point.time),
      value: valueFor(point)
    }))
    .filter((sample): sample is ChartSample => isFiniteNumber(sample.time) && isFiniteNumber(sample.value));
}

function speedSamples(trackpoints: readonly NormalizedTrackPoint[]): ChartSample[] {
  return trackpoints
    .map((point, index) => ({
      time: Date.parse(point.time),
      value: (point.speedMps ?? derivedSpeedMps(trackpoints, index)) * 3.6
    }))
    .filter((sample): sample is ChartSample => isFiniteNumber(sample.time) && isFiniteNumber(sample.value) && sample.value > 0);
}

function paceSamples(trackpoints: readonly NormalizedTrackPoint[]): ChartSample[] {
  return speedSamples(trackpoints)
    .map((sample) => ({
      time: sample.time,
      value: 3600 / sample.value
    }))
    .filter((sample) => isFiniteNumber(sample.value) && sample.value > 0);
}

function derivedSpeedMps(trackpoints: readonly NormalizedTrackPoint[], index: number): number {
  if (index <= 0) {
    return Number.NaN;
  }
  const current = trackpoints[index];
  const previous = trackpoints[index - 1];
  if (current.distanceMeters === null || previous.distanceMeters === null) {
    return Number.NaN;
  }
  const seconds = (Date.parse(current.time) - Date.parse(previous.time)) / 1000;
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return Number.NaN;
  }
  const meters = current.distanceMeters - previous.distanceMeters;
  return meters > 0 ? meters / seconds : Number.NaN;
}

function samplesToPolyline(samples: readonly ChartSample[]): string {
  if (!samples.length) {
    return '';
  }
  const minTime = Math.min(...samples.map((sample) => sample.time));
  const maxTime = Math.max(...samples.map((sample) => sample.time));
  const minValue = Math.min(...samples.map((sample) => sample.value));
  const maxValue = Math.max(...samples.map((sample) => sample.value));
  const timeRange = maxTime - minTime || 1;
  const valueRange = maxValue - minValue || 1;

  return samples
    .map((sample) => {
      const x = SVG_PADDING + ((sample.time - minTime) / timeRange) * (SVG_WIDTH - SVG_PADDING * 2);
      const y = SVG_HEIGHT - SVG_PADDING - ((sample.value - minValue) / valueRange) * (SVG_HEIGHT - SVG_PADDING * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function hasGpsCoordinates(point: NormalizedTrackPoint): boolean {
  return isFiniteNumber(point.latitude) && isFiniteNumber(point.longitude);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
