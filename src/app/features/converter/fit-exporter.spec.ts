import { Decoder, Stream, Utils } from '@garmin/fitsdk';
import { NormalizedActivity } from '@shared/models';
import { exportActivityToFit, degreesToSemicircles, toFitTimestamp } from './fit-exporter';
import { mapPolarSportToFit } from './fit-mapping';

describe('FIT exporter', () => {
  it('maps mountain biking to Garmin cycling mountain sub sport', () => {
    expect(mapPolarSportToFit('MOUNTAIN_BIKING')).toEqual({ sport: 'cycling', subSport: 'mountain' });
    expect(mapPolarSportToFit('5')).toEqual({ sport: 'cycling', subSport: 'mountain' });
  });

  it('maps observed numeric Polar sport ids to concrete Garmin FIT sports', () => {
    expect(mapPolarSportToFit('1')).toEqual({ sport: 'running', subSport: 'generic' });
    expect(mapPolarSportToFit('2')).toEqual({ sport: 'cycling', subSport: 'generic' });
    expect(mapPolarSportToFit('3')).toEqual({ sport: 'walking', subSport: 'generic' });
    expect(mapPolarSportToFit('4')).toEqual({ sport: 'running', subSport: 'generic' });
    expect(mapPolarSportToFit('15')).toEqual({ sport: 'training', subSport: 'strengthTraining' });
    expect(mapPolarSportToFit('17')).toEqual({ sport: 'running', subSport: 'treadmill' });
    expect(mapPolarSportToFit('34')).toEqual({ sport: 'hiit', subSport: 'hiit' });
    expect(mapPolarSportToFit('56')).toEqual({ sport: 'mixedMartialArts', subSport: 'generic' });
    expect(mapPolarSportToFit('94')).toEqual({ sport: 'rockClimbing', subSport: 'indoorClimbing' });
    expect(mapPolarSportToFit('95')).toEqual({ sport: 'kayaking', subSport: 'generic' });
    expect(mapPolarSportToFit('103')).toEqual({ sport: 'swimming', subSport: 'lapSwimming' });
    expect(mapPolarSportToFit('104')).toEqual({ sport: 'baseball', subSport: 'generic' });
    expect(mapPolarSportToFit('109')).toEqual({ sport: 'boxing', subSport: 'generic' });
    expect(mapPolarSportToFit('110')).toEqual({ sport: 'boxing', subSport: 'generic' });
    expect(mapPolarSportToFit('117')).toEqual({ sport: 'rowing', subSport: 'indoorRowing' });
    expect(mapPolarSportToFit('153')).toEqual({ sport: 'running', subSport: 'obstacle' });
    expect(mapPolarSportToFit('186')).toEqual({ sport: 'teamSport', subSport: 'ultimate' });
    expect(mapPolarSportToFit('191')).toEqual({ sport: 'videoGaming', subSport: 'esport' });
    expect(mapPolarSportToFit('195')).toEqual({ sport: 'cycling', subSport: 'gravelCycling' });
    expect(mapPolarSportToFit('203')).toEqual({ sport: 'hiking', subSport: 'rucking' });
    expect(mapPolarSportToFit('VERTICALSPORTS_WALLCLIMBING')).toEqual({
      sport: 'rockClimbing',
      subSport: 'indoorClimbing'
    });
  });

  it('maps numeric Polar Flow ids through the same FIT mapping as canonical sport names', () => {
    const cases: Array<[string, string]> = [
      ['2', 'CYCLING'],
      ['3', 'WALKING'],
      ['17', 'TREADMILL_RUNNING'],
      ['34', 'HIIT'],
      ['94', 'VERTICALSPORTS_WALLCLIMBING'],
      ['103', 'POOL_SWIMMING'],
      ['109', 'BOXING'],
      ['110', 'KICKBOXING_MARTIAL_ARTS'],
      ['117', 'INDOOR_ROWING'],
      ['186', 'ULTIMATE'],
      ['195', 'GRAVEL'],
      ['203', 'RUCKING']
    ];

    for (const [id, kind] of cases) {
      expect(mapPolarSportToFit(id)).toEqual(mapPolarSportToFit(kind));
    }
  });

  it('warns when a known Polar Flow sport has no precise FIT equivalent', () => {
    expect(mapPolarSportToFit('154')).toEqual({
      sport: 'generic',
      subSport: 'generic',
      warning: 'Nieobsługiwany sport Polar dla FIT: RINGETTE. Użyto generic.'
    });
  });

  it('converts GPS degrees to semicircles', () => {
    expect(degreesToSemicircles(180)).toBe(2147483648);
    expect(degreesToSemicircles(-180)).toBe(-2147483648);
    expect(degreesToSemicircles(0)).toBe(0);
  });

  it('converts UTC ISO time to FIT timestamp using SDK epoch', () => {
    const isoTime = '2024-05-02T06:30:00Z';
    expect(toFitTimestamp(isoTime)).toBe(Utils.convertDateToDateTime(new Date(isoTime)));
  });

  it('exports and round-trip decodes an activity with GPS and HR', () => {
    const result = exportActivityToFit(activityFixture());

    expect(result.status).toBe('success');
    expect(result.format).toBe('fit');
    expect(result.filename.endsWith('.fit')).toBe(true);
    expect(result.mimeType).toBe('application/vnd.ant.fit');
    expect(result.content).toBeInstanceOf(Uint8Array);

    const content = result.content as Uint8Array;
    expect(content.length).toBeGreaterThan(0);

    const decoder = new Decoder(Stream.fromArrayBuffer(toArrayBuffer(content)));
    expect(decoder.isFIT()).toBe(true);
    expect(decoder.checkIntegrity()).toBe(true);
    const { messages, errors } = decoder.read();
    expect(errors).toEqual([]);
    expect(messages.recordMesgs).toHaveLength(3);
    expect(messages.fileIdMesgs?.length).toBeGreaterThan(0);
    expect(messages.sessionMesgs?.[0]?.sport).toBe('cycling');
    expect(messages.sessionMesgs?.[0]?.subSport).toBe('mountain');
    expect(messages.sessionMesgs?.[0]?.totalDistance).toBeCloseTo(4100);
    expect(messages.sessionMesgs?.[0]?.avgHeartRate).toBe(140);
    expect(messages.sessionMesgs?.[0]?.maxHeartRate).toBe(155);
    expect(result.warnings).toEqual([]);
    expect(result.garminReady?.formatValidations.some((item) => item.format === 'fit' && item.validationLevel === 'local_sdk')).toBe(true);
  });

  it('exports an activity without GPS when timed records exist', () => {
    const activity = activityFixture({
      trackpoints: activityFixture().trackpoints.map((trackpoint) => ({
        ...trackpoint,
        latitude: null,
        longitude: null
      })),
      hasGps: false
    });

    const result = exportActivityToFit(activity);

    expect(result.status).toBe('success');
    expect(result.warnings.join(' ')).not.toContain('Brak GPS');
    expect(result.warnings.join(' ')).not.toContain('Brak dystansu');
  });

  it('exports observed wall climbing id as Garmin rock climbing subtype', () => {
    const result = exportActivityToFit(
      activityFixture({
        sport: 'Other',
        sportDetail: 'Wall climbing',
        metadata: { polarSport: 'VERTICALSPORTS_WALLCLIMBING', rawSport: { id: '94' } }
      })
    );

    expect(result.status).toBe('success');
    const decoder = new Decoder(Stream.fromArrayBuffer(toArrayBuffer(result.content as Uint8Array)));
    const { messages } = decoder.read();
    expect(messages.sessionMesgs?.[0]?.sport).toBe('rockClimbing');
    expect(messages.sessionMesgs?.[0]?.subSport).toBe('indoorClimbing');
  });

  it('exports pool swimming lengths for Garmin activity details', () => {
    const result = exportActivityToFit(
      activityFixture({
        sport: 'Other',
        sportDetail: 'Pool swimming',
        durationSeconds: 70,
        distanceMeters: 50,
        averageHeartRate: 110,
        maxHeartRate: 120,
        metadata: {
          polarSport: 'POOL_SWIMMING',
          swimming: {
            poolLengthMeters: 25,
            poolsSwum: 2,
            totalStrokeCount: 30,
            phases: [
              { startOffsetMillis: 0, durationMillis: 30000, style: 'FREESTYLE', strokes: 14 },
              { startOffsetMillis: 40000, durationMillis: 30000, style: 'BREASTSTROKE', strokes: 16 }
            ],
            laps: [{ splitTimeMillis: 70000, durationMillis: 70000, distanceMeters: 50, poolsSwum: 2, strokes: 30 }]
          }
        },
        trackpoints: [
          {
            ...activityFixture().trackpoints[0],
            time: '2024-05-02T06:30:00Z',
            latitude: null,
            longitude: null,
            distanceMeters: 0,
            heartRate: 100,
            speedMps: null
          },
          {
            ...activityFixture().trackpoints[0],
            time: '2024-05-02T06:30:30Z',
            latitude: null,
            longitude: null,
            distanceMeters: 25,
            heartRate: 110,
            speedMps: null
          },
          {
            ...activityFixture().trackpoints[0],
            time: '2024-05-02T06:31:10Z',
            latitude: null,
            longitude: null,
            distanceMeters: 50,
            heartRate: 120,
            speedMps: null
          }
        ],
        hasGps: false,
        trackpointCount: 3
      })
    );

    expect(result.status).toBe('success');
    expect(result.warnings).toEqual([]);
    const decoder = new Decoder(Stream.fromArrayBuffer(toArrayBuffer(result.content as Uint8Array)));
    const { messages } = decoder.read();
    expect(messages.sessionMesgs?.[0]).toMatchObject({
      sport: 'swimming',
      subSport: 'lapSwimming',
      numLengths: 2,
      numActiveLengths: 2,
      poolLength: 25,
      poolLengthUnit: 'metric',
      totalStrokes: 30
    });
    expect(messages.lapMesgs?.[0]).toMatchObject({
      sport: 'swimming',
      subSport: 'lapSwimming',
      numLengths: 2,
      firstLengthIndex: 0,
      totalStrokes: 30
    });
    expect(messages.lengthMesgs).toHaveLength(2);
    expect(messages.lengthMesgs?.[0]).toMatchObject({ swimStroke: 'freestyle', totalStrokes: 14, lengthType: 'active' });
    expect(messages.lengthMesgs?.[1]).toMatchObject({ swimStroke: 'breaststroke', totalStrokes: 16, lengthType: 'active' });
  });

  it('downgrades pool swimming to generic swimming when length metadata is missing', () => {
    const result = exportActivityToFit(
      activityFixture({
        sport: 'Other',
        sportDetail: 'Pool swimming',
        metadata: { polarSport: 'POOL_SWIMMING' },
        trackpoints: activityFixture().trackpoints.map((trackpoint) => ({
          ...trackpoint,
          latitude: null,
          longitude: null
        })),
        hasGps: false
      })
    );

    expect(result.status).toBe('success');
    expect(result.warnings.join(' ')).toContain('Brak danych długości basenu');
    const decoder = new Decoder(Stream.fromArrayBuffer(toArrayBuffer(result.content as Uint8Array)));
    const { messages } = decoder.read();
    expect(messages.sessionMesgs?.[0]?.sport).toBe('swimming');
    expect(messages.sessionMesgs?.[0]?.subSport).toBe('generic');
    expect(messages.lengthMesgs ?? []).toHaveLength(0);
  });

  it('returns an error for activity without valid trackpoints', () => {
    const result = exportActivityToFit(activityFixture({ trackpoints: [], trackpointCount: 0 }));

    expect(result.status).toBe('error');
    expect(result.errors.join(' ')).toContain('Brak poprawnych record messages');
  });

  it('warns and omits invalid values during export', () => {
    const activity = activityFixture({
      trackpoints: [
        {
          ...activityFixture().trackpoints[0],
          latitude: 120,
          heartRate: 500,
          distanceMeters: -1,
          powerWatts: -10
        }
      ]
    });

    const result = exportActivityToFit(activity);

    expect(result.status).toBe('success');
    expect(result.warnings.join(' ')).toContain('nieprawidłowe współrzędne GPS');
    expect(result.warnings.join(' ')).toContain('heartRate');
    expect(result.warnings.join(' ')).toContain('distance');
    expect(result.warnings.join(' ')).toContain('power');
  });
});

function activityFixture(overrides: Partial<NormalizedActivity> = {}): NormalizedActivity {
  return {
    source: 'Polar Flow',
    sourceFilename: 'training-session-sample.json',
    sourceFileKind: 'training_session',
    activityId: 'synthetic-gps-hr-001',
    sport: 'Biking',
    sportDetail: 'Jazda na rowerze górskim',
    startTime: '2024-05-02T06:30:00Z',
    durationSeconds: 1200,
    distanceMeters: 4100,
    calories: 245,
    averageHeartRate: 140,
    maxHeartRate: 155,
    trackpointCount: 3,
    hasGps: true,
    hasHeartRate: true,
    hasCadence: true,
    hasPower: false,
    metadata: { polarSport: 'MOUNTAIN_BIKING' },
    laps: [
      {
        startTime: '2024-05-02T06:30:00Z',
        totalTimeSeconds: 1200,
        distanceMeters: 4100,
        calories: 245,
        averageHeartRate: 140,
        maxHeartRate: 155
      }
    ],
    trackpoints: [
      {
        time: '2024-05-02T06:30:00Z',
        latitude: 0.001,
        longitude: 0.001,
        altitudeMeters: 100,
        distanceMeters: 0,
        heartRate: 120,
        cadence: 78,
        speedMps: 2.5,
        powerWatts: null,
        temperatureCelsius: null
      },
      {
        time: '2024-05-02T06:40:00Z',
        latitude: 0.002,
        longitude: 0.002,
        altitudeMeters: 104,
        distanceMeters: 2050,
        heartRate: 146,
        cadence: 82,
        speedMps: 3.4,
        powerWatts: null,
        temperatureCelsius: null
      },
      {
        time: '2024-05-02T06:50:00Z',
        latitude: 0.003,
        longitude: 0.003,
        altitudeMeters: 108,
        distanceMeters: 4100,
        heartRate: 155,
        cadence: 84,
        speedMps: 4.2,
        powerWatts: null,
        temperatureCelsius: null
      }
    ],
    ...overrides
  };
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
