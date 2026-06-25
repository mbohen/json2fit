import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NormalizedActivity } from '@shared/models';
import { ActivityChartsComponent } from './activity-charts.component';

describe('ActivityChartsComponent', () => {
  let fixture: ComponentFixture<ActivityChartsComponent>;

  beforeEach(async () => {
    localStorage.setItem('json2fit.language', 'pl');

    await TestBed.configureTestingModule({
      imports: [ActivityChartsComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(ActivityChartsComponent);
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('renders a heart-rate chart when HR data exists', () => {
    fixture.componentRef.setInput('activity', normalizedActivityFixture());
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[data-testid="activity-chart-heart-rate"]') as HTMLElement;
    const polyline = panel.querySelector('[data-testid="activity-chart-polyline"]') as SVGPolylineElement;

    expect(panel.textContent).toContain('Tętno');
    expect(panel.textContent).toContain('bpm');
    expect(polyline.getAttribute('points')).toContain(',');
  });

  it('shows an empty HR state without breaking the rest of the charts', () => {
    fixture.componentRef.setInput(
      'activity',
      normalizedActivityFixture({
        hasHeartRate: false,
        averageHeartRate: null,
        maxHeartRate: null,
        trackpoints: normalizedActivityFixture().trackpoints.map((point) => ({ ...point, heartRate: null }))
      })
    );
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[data-testid="activity-chart-heart-rate"]') as HTMLElement;
    expect(panel.textContent).toContain('Brak danych tętna');
    expect(fixture.nativeElement.textContent).toContain('Tempo');
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
      trackpointFixture('2024-05-02T06:30:00Z', 0, 120),
      trackpointFixture('2024-05-02T06:40:00Z', 2000, 146),
      trackpointFixture('2024-05-02T06:50:00Z', 4000, 155)
    ],
    laps: [],
    metadata: {},
    ...overrides
  };
}

function trackpointFixture(time: string, distanceMeters: number, heartRate: number): NormalizedActivity['trackpoints'][number] {
  return {
    time,
    latitude: 0.02 + distanceMeters / 100000,
    longitude: 21.0 + distanceMeters / 100000,
    altitudeMeters: 100 + distanceMeters / 1000,
    distanceMeters,
    heartRate,
    cadence: 82,
    speedMps: null,
    powerWatts: null,
    temperatureCelsius: null
  };
}
