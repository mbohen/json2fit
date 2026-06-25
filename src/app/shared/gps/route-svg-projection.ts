export interface GpsPoint {
  latitude: number;
  longitude: number;
}

export interface ProjectedPoint {
  x: number;
  y: number;
}

export interface SvgPoint {
  x: number;
  y: number;
}

export interface ProjectedBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

export interface RouteProjectionFrame {
  minLon: number;
  maxLat: number;
  cosMeanLatitude: number;
}

export interface RouteSvgProjectionOptions {
  width: number;
  height: number;
  padding: number;
}

export interface ScaledProjectedRoute {
  points: SvgPoint[];
  scale: number;
  scaleX: number;
  scaleY: number;
}

export interface RouteSvgProjection {
  points: SvgPoint[];
  polyline: string;
  projectedBounds: ProjectedBounds | null;
  scale: number;
  scaleX: number;
  scaleY: number;
  cosMeanLatitude: number;
}

const EPSILON = 1e-12;

export function projectRouteToSvg(
  allPoints: readonly GpsPoint[],
  renderedPoints: readonly GpsPoint[],
  options: RouteSvgProjectionOptions
): RouteSvgProjection {
  const validAllPoints = allPoints.filter(isFiniteGpsPoint);
  const validRenderedPoints = renderedPoints.filter(isFiniteGpsPoint);
  const frame = createRouteProjectionFrame(validAllPoints);
  if (!frame || !validRenderedPoints.length) {
    return emptyProjection();
  }

  const allProjectedPoints = validAllPoints.map((point) => projectGpsPoint(point, frame));
  const projectedBounds = boundsForProjectedPoints(allProjectedPoints);
  if (!projectedBounds) {
    return emptyProjection(frame.cosMeanLatitude);
  }

  const renderedProjectedPoints = validRenderedPoints.map((point) => projectGpsPoint(point, frame));
  const scaled = scaleProjectedPoints(renderedProjectedPoints, projectedBounds, options);
  return {
    points: scaled.points,
    polyline: scaled.points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' '),
    projectedBounds,
    scale: scaled.scale,
    scaleX: scaled.scaleX,
    scaleY: scaled.scaleY,
    cosMeanLatitude: frame.cosMeanLatitude
  };
}

export function projectGpsPoints(points: readonly GpsPoint[]): ProjectedPoint[] {
  const validPoints = points.filter(isFiniteGpsPoint);
  const frame = createRouteProjectionFrame(validPoints);
  return frame ? validPoints.map((point) => projectGpsPoint(point, frame)) : [];
}

export function scaleProjectedPoints(
  points: readonly ProjectedPoint[],
  bounds: ProjectedBounds,
  options: RouteSvgProjectionOptions
): ScaledProjectedRoute {
  const availableWidth = Math.max(0, options.width - options.padding * 2);
  const availableHeight = Math.max(0, options.height - options.padding * 2);
  const scaleX = bounds.width > EPSILON ? availableWidth / bounds.width : Number.POSITIVE_INFINITY;
  const scaleY = bounds.height > EPSILON ? availableHeight / bounds.height : Number.POSITIVE_INFINITY;
  const rawScale = Math.min(scaleX, scaleY);
  const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;
  const drawnWidth = bounds.width * scale;
  const drawnHeight = bounds.height * scale;
  const offsetX = (availableWidth - drawnWidth) / 2;
  const offsetY = (availableHeight - drawnHeight) / 2;

  return {
    points: points.map((point) => ({
      x: options.padding + offsetX + (point.x - bounds.minX) * scale,
      y: options.padding + offsetY + (point.y - bounds.minY) * scale
    })),
    scale,
    scaleX,
    scaleY
  };
}

export function boundsForProjectedPoints(points: readonly ProjectedPoint[]): ProjectedBounds | null {
  if (!points.length) {
    return null;
  }
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function createRouteProjectionFrame(points: readonly GpsPoint[]): RouteProjectionFrame | null {
  if (!points.length) {
    return null;
  }
  const meanLat = points.reduce((sum, point) => sum + point.latitude, 0) / points.length;
  return {
    minLon: Math.min(...points.map((point) => point.longitude)),
    maxLat: Math.max(...points.map((point) => point.latitude)),
    cosMeanLatitude: Math.cos((meanLat * Math.PI) / 180)
  };
}

function projectGpsPoint(point: GpsPoint, frame: RouteProjectionFrame): ProjectedPoint {
  return {
    x: (point.longitude - frame.minLon) * frame.cosMeanLatitude,
    y: frame.maxLat - point.latitude
  };
}

function isFiniteGpsPoint(point: GpsPoint): boolean {
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
}

function emptyProjection(cosMeanLatitude = 1): RouteSvgProjection {
  return {
    points: [],
    polyline: '',
    projectedBounds: null,
    scale: 1,
    scaleX: Number.POSITIVE_INFINITY,
    scaleY: Number.POSITIVE_INFINITY,
    cosMeanLatitude
  };
}
