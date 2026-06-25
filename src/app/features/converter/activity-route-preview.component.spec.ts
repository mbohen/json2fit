import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NormalizedActivity } from '@shared/models';
import { ActivityRoutePreviewComponent } from './activity-route-preview.component';

describe('ActivityRoutePreviewComponent', () => {
  let fixture: ComponentFixture<ActivityRoutePreviewComponent>;

  beforeEach(async () => {
    localStorage.setItem('json2fit.language', 'pl');

    await TestBed.configureTestingModule({
      imports: [ActivityRoutePreviewComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(ActivityRoutePreviewComponent);
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('renders a local GPS route when activity has coordinates', () => {
    fixture.componentRef.setInput('activity', normalizedActivityFixture());
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    const polyline = fixture.nativeElement.querySelector('[data-testid="activity-route-polyline"]') as SVGPolylineElement;

    expect(text).toContain('Ślad GPS lokalny');
    expect(polyline.getAttribute('points')).toContain(',');
  });

  it('shows Brak GPS when activity has no coordinates', () => {
    fixture.componentRef.setInput(
      'activity',
      normalizedActivityFixture({
        hasGps: false,
        trackpoints: normalizedActivityFixture().trackpoints.map((point) => ({
          ...point,
          latitude: null,
          longitude: null
        }))
      })
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Brak GPS');
    expect(fixture.nativeElement.querySelector('[data-testid="activity-route-polyline"]')).toBeNull();
  });
});

function normalizedActivityFixture(overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  return {
    source: 'Polar Flow',
    sourceFilename: 'training-session-preview.json',
    sourceFileKind: 'training_session',
    activityId: 'preview',
    sport: 'Running',
    sportDetail: 'Running',
    startTime: '2024-05-02T06:30:00Z',
    durationSeconds: 1200,
    distanceMeters: 4000,
    calories: 245,
    trackpointCount: 3,
    hasGps: true,
    hasHeartRate: true,
    hasCadence: true,
    hasPower: false,
    averageHeartRate: 140,
    maxHeartRate: 155,
    trackpoints: [
      trackpointFixture('2024-05-02T06:30:00Z', 0.001, 0.001, 0, 120),
      trackpointFixture('2024-05-02T06:40:00Z', 0.002, 0.002, 2000, 146),
      trackpointFixture('2024-05-02T06:50:00Z', 0.003, 0.003, 4000, 155)
    ],
    laps: [],
    metadata: {},
    ...overrides
  };
}

function trackpointFixture(
  time: string,
  latitude: number,
  longitude: number,
  distanceMeters: number,
  heartRate: number
): NormalizedActivity['trackpoints'][number] {
  return {
    time,
    latitude,
    longitude,
    altitudeMeters: 100 + distanceMeters / 1000,
    distanceMeters,
    heartRate,
    cadence: 82,
    speedMps: null,
    powerWatts: null,
    temperatureCelsius: null
  };
}
