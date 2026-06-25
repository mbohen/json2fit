export interface ActivitySummary {
  sourceFilename: string;
  sourceFileKind: string;
  activityId: string | null;
  sport: string;
  sportDetail: string | null;
  startTime: string;
  durationSeconds: number | null;
  distanceMeters: number | null;
  calories: number | null;
  trackpointCount: number;
  hasGps: boolean;
  hasHeartRate: boolean;
  hasCadence: boolean;
  hasPower: boolean;
}

export interface NormalizedTrackPoint {
  time: string;
  latitude: number | null;
  longitude: number | null;
  altitudeMeters: number | null;
  distanceMeters: number | null;
  heartRate: number | null;
  cadence: number | null;
  speedMps: number | null;
  powerWatts: number | null;
  temperatureCelsius: number | null;
}

export interface NormalizedLap {
  startTime: string;
  totalTimeSeconds: number | null;
  distanceMeters: number | null;
  calories: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
}

export interface NormalizedActivity extends ActivitySummary {
  source: string;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  trackpoints: NormalizedTrackPoint[];
  laps: NormalizedLap[];
  metadata: Record<string, unknown>;
}
