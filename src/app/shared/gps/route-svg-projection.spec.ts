import {
  boundsForProjectedPoints,
  projectGpsPoints,
  projectRouteToSvg,
  scaleProjectedPoints
} from './route-svg-projection';

describe('route SVG projection', () => {
  it('returns a safe empty projection for empty data', () => {
    const projection = projectRouteToSvg([], [], { width: 640, height: 220, padding: 16 });

    expect(projection.polyline).toBe('');
    expect(projection.points).toEqual([]);
    expect(projection.projectedBounds).toBeNull();
  });

  it('centers a single point without dividing by zero', () => {
    const projection = projectRouteToSvg(
      [{ latitude: 0.001, longitude: 0.001 }],
      [{ latitude: 0.001, longitude: 0.001 }],
      { width: 640, height: 220, padding: 16 }
    );

    expect(projection.polyline).toBe('320.0,110.0');
    expect(projection.scale).toBe(1);
  });

  it('creates a valid line for two GPS points', () => {
    const projection = projectRouteToSvg(
      [
        { latitude: 0.001, longitude: 0.001 },
        { latitude: 0.003, longitude: 0.003 }
      ],
      [
        { latitude: 0.001, longitude: 0.001 },
        { latitude: 0.003, longitude: 0.003 }
      ],
      { width: 640, height: 220, padding: 16 }
    );

    expect(projection.points).toHaveLength(2);
    expect(projection.polyline).toContain(' ');
    expect(projection.polyline).toContain(',');
  });

  it('applies cos(meanLat) correction to longitude projection', () => {
    const projected = projectGpsPoints([
      { latitude: 60, longitude: 10 },
      { latitude: 60, longitude: 11 }
    ]);

    expect(projected[1].x - projected[0].x).toBeCloseTo(0.5, 6);
  });

  it('uses one shared scale based on min(scaleX, scaleY)', () => {
    const bounds = boundsForProjectedPoints([
      { x: 0, y: 0 },
      { x: 10, y: 2 }
    ]);

    const scaled = scaleProjectedPoints(
      [
        { x: 0, y: 0 },
        { x: 10, y: 2 }
      ],
      bounds!,
      { width: 100, height: 100, padding: 0 }
    );

    expect(scaled.scaleX).toBe(10);
    expect(scaled.scaleY).toBe(50);
    expect(scaled.scale).toBe(10);
    expect(scaled.scale).toBe(Math.min(scaled.scaleX, scaled.scaleY));
  });
});
