import { NormalizedTrackPoint } from '@shared/models';
import {
  buildRoutePreview,
  downsampleForPreview,
  MAX_CHART_PREVIEW_POINTS,
  MAX_ROUTE_PREVIEW_POINTS
} from './activity-preview.utils';

describe('activity preview utils', () => {
  it('downsamples without mutating the source array and preserves endpoints', () => {
    const source = Array.from({ length: 1200 }, (_, index) => ({ index }));
    const snapshot = [...source];

    const result = downsampleForPreview(source, MAX_CHART_PREVIEW_POINTS);

    expect(result).not.toBe(source);
    expect(result.length).toBeLessThanOrEqual(MAX_CHART_PREVIEW_POINTS);
    expect(result[0]).toBe(source[0]);
    expect(result[result.length - 1]).toBe(source[source.length - 1]);
    expect(source).toEqual(snapshot);
  });

  it('limits route rendering points without changing GPS totals', () => {
    const trackpoints: NormalizedTrackPoint[] = Array.from({ length: 1201 }, (_, index) => ({
      time: `2024-05-02T06:${String(index % 60).padStart(2, '0')}:00Z`,
      latitude: 52 + index / 10000,
      longitude: 21 + index / 10000,
      altitudeMeters: null,
      distanceMeters: index,
      heartRate: null,
      cadence: null,
      speedMps: null,
      powerWatts: null,
      temperatureCelsius: null
    }));

    const preview = buildRoutePreview(trackpoints);

    expect(preview.hasGps).toBe(true);
    expect(preview.totalGpsPoints).toBe(1201);
    expect(preview.renderedGpsPoints).toBeLessThanOrEqual(MAX_ROUTE_PREVIEW_POINTS);
    expect(preview.polyline).toContain(',');
    expect(trackpoints).toHaveLength(1201);
  });

  it('uses all GPS points for route bounds even when rendering is downsampled', () => {
    const trackpoints: NormalizedTrackPoint[] = [
      gpsTrackpointFixture('2024-05-02T06:30:00Z', 0, 0),
      gpsTrackpointFixture('2024-05-02T06:31:00Z', 0, 100),
      gpsTrackpointFixture('2024-05-02T06:32:00Z', 10, 0)
    ];

    const preview = buildRoutePreview(trackpoints, 2);
    const points = parsePolyline(preview.polyline);

    expect(preview.totalGpsPoints).toBe(3);
    expect(preview.renderedGpsPoints).toBe(2);
    expect(points).toHaveLength(2);
    expect(Math.abs(points[1].y - points[0].y)).toBeLessThan(100);
  });
});

function gpsTrackpointFixture(time: string, latitude: number, longitude: number): NormalizedTrackPoint {
  return {
    time,
    latitude,
    longitude,
    altitudeMeters: null,
    distanceMeters: null,
    heartRate: null,
    cadence: null,
    speedMps: null,
    powerWatts: null,
    temperatureCelsius: null
  };
}

function parsePolyline(polyline: string): Array<{ x: number; y: number }> {
  return polyline.split(' ').map((point) => {
    const [x, y] = point.split(',').map(Number);
    return { x, y };
  });
}
