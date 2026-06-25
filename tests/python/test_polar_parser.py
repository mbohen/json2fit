import csv
import json
from pathlib import Path

import pytest

from converter.polar_parser import parse_polar_activity
from converter.sport_mapping import map_sport_to_display, map_sport_to_polar_kind, map_sport_to_tcx

FIXTURES = Path(__file__).parents[1] / "fixtures"


def load_fixture(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def test_parses_minimal_training_session():
    activity, warnings = parse_polar_activity(
        "training-session-minimal.json",
        "training_session",
        load_fixture("training-session-sample-minimal.json"),
    )
    assert activity is not None
    assert activity.sport == "Running"
    assert activity.duration_seconds == 600
    assert activity.distance_meters == 1200
    assert len(activity.trackpoints) == 2
    assert warnings == []


def test_parses_training_with_gps_and_heart_rate():
    activity, warnings = parse_polar_activity(
        "training-session-gps.json",
        "training_session",
        load_fixture("training-session-sample-with-gps-hr.json"),
    )
    assert activity is not None
    assert activity.sport == "Running"
    assert activity.average_heart_rate == 140
    assert activity.max_heart_rate == 155
    assert activity.trackpoints[0].latitude == 0.001
    assert activity.trackpoints[-1].distance_meters == 4100
    assert "Brak danych GPS" not in " ".join(warnings)


def test_parses_training_without_gps_without_gps_warning():
    activity, warnings = parse_polar_activity(
        "training-session-no-gps.json",
        "training_session",
        load_fixture("training-session-sample-without-gps.json"),
    )
    assert activity is not None
    assert activity.sport == "Running"
    assert len(activity.trackpoints) == 3
    assert "Brak danych GPS" not in " ".join(warnings)


def test_merges_polar_route_waypoints_into_series_trackpoints():
    activity, warnings = parse_polar_activity(
        "training-session-route.json",
        "training_session",
        {
            "id": "route-regression",
            "sport": {"id": "RUNNING"},
            "startTime": "2024-05-01T10:00:00Z",
            "durationMillis": 2000,
            "exercises": [
                {
                    "samples": {
                        "samples": [
                            {"type": "DISTANCE", "intervalMillis": 1000, "values": ["0", "10", "20"]},
                            {"type": "HEART_RATE", "intervalMillis": 1000, "values": [120, 122, 124]},
                            {"type": "ALTITUDE", "intervalMillis": 1000, "values": [10, 11, 12]},
                        ]
                    },
                    "routes": {
                        "route": {
                            "startTime": "2024-05-01T10:00:00Z",
                            "wayPoints": [
                                {"elapsedMillis": 0, "latitude": 0.01, "longitude": 0.01, "altitude": 100},
                                {"elapsedMillis": 1000, "latitude": 0.02, "longitude": 0.02, "altitude": 101},
                                {"elapsedMillis": 2000, "latitude": 0.03, "longitude": 0.03, "altitude": 102},
                            ],
                        }
                    },
                }
            ],
        },
    )

    assert activity is not None
    assert len(activity.trackpoints) == 3
    assert activity.trackpoints[1].latitude == 0.02
    assert activity.trackpoints[1].longitude == 0.02
    assert activity.trackpoints[1].heart_rate == 122
    assert activity.trackpoints[1].distance_meters == 10
    assert activity.trackpoints[1].altitude_meters == 101
    assert "Brak danych GPS" not in " ".join(warnings)


def test_converts_polar_series_speed_from_kmh_to_mps():
    activity, _ = parse_polar_activity(
        "training-session-speed.json",
        "training_session",
        {
            "id": "speed-regression",
            "sport": {"id": "5"},
            "startTime": "2026-05-10T13:20:00Z",
            "durationMillis": 2000,
            "exercises": [
                {
                    "samples": {
                        "samples": [
                            {"type": "DISTANCE", "intervalMillis": 1000, "values": ["0", "10", "20"]},
                            {"type": "SPEED", "intervalMillis": 1000, "values": [0, 23.8, 36.0]},
                        ]
                    },
                }
            ],
        },
    )

    assert activity is not None
    assert activity.trackpoints[1].speed_mps == pytest.approx(23.8 / 3.6)
    assert activity.trackpoints[2].speed_mps == pytest.approx(10)


def test_prefers_activity_level_duration_millis_over_nested_duration_fields():
    activity, _ = parse_polar_activity(
        "training-session-duration.json",
        "training_session",
        {
            "id": "duration-regression",
            "sport": {"id": "RUNNING"},
            "startTime": "2024-05-01T10:00:00Z",
            "durationMillis": 9046592,
            "exercises": [
                {
                    "statistics": {
                        "statistics": [
                            {"type": "SOME_POLAR_STAT", "duration": 147000},
                        ]
                    },
                    "samples": {
                        "samples": [
                            {"type": "DISTANCE", "intervalMillis": 1000, "values": ["0", "10", "20"]},
                            {"type": "HEART_RATE", "intervalMillis": 1000, "values": [120, 122, 124]},
                        ]
                    },
                }
            ],
        },
    )

    assert activity is not None
    assert activity.duration_seconds == 9046.592


def test_applies_polar_timezone_offset_numeric_sport_and_altitude_series():
    activity, _ = parse_polar_activity(
        "training-session-timezone.json",
        "training_session",
        {
            "id": "timezone-regression",
            "sport": {"id": "5"},
            "startTime": "2026-05-10T13:20:00",
            "timezoneOffsetMinutes": 120,
            "durationMillis": 1000,
            "exercises": [
                {
                    "samples": {
                        "samples": [
                            {"type": "DISTANCE", "intervalMillis": 1000, "values": ["0", "10"]},
                            {"type": "ALTITUDE", "intervalMillis": 1000, "values": [100, 101]},
                        ]
                    },
                }
            ],
        },
    )

    assert activity is not None
    assert activity.start_time.isoformat() == "2026-05-10T11:20:00+00:00"
    assert activity.sport == "Biking"
    assert activity.sport_detail == "Jazda na rowerze górskim"
    assert activity.trackpoints[1].altitude_meters == 101


def test_prefers_numeric_sport_id_34_over_conflicting_label():
    activity, _ = parse_polar_activity(
        "training-session-hiit.json",
        "training_session",
        {
            "id": "hiit-regression",
            "sportProfile": "Dancing",
            "sport": {"id": "34", "name": "Dancing"},
            "startTime": "2026-05-10T13:20:00Z",
            "durationMillis": 1000,
            "exercises": [
                {
                    "samples": {
                        "samples": [
                            {"type": "HEART_RATE", "intervalMillis": 1000, "values": [120, 130]},
                        ]
                    },
                }
            ],
        },
    )

    assert activity is not None
    assert activity.sport == "Other"
    assert activity.sport_detail == "HIIT"
    assert activity.metadata["polarSport"] == "HIIT"


def test_extracts_pool_swimming_metadata_for_fit_lengths():
    activity, _ = parse_polar_activity(
        "pool-swim.json",
        "training_session",
        {
            "id": "pool-swim",
            "sport": {"id": "103"},
            "startTime": "2021-02-21T15:52:15",
            "timezoneOffsetMinutes": 60,
            "durationMillis": 70000,
            "distanceMeters": 50,
            "exercises": [
                {
                    "statistics": {
                        "swimmingStatistics": {
                            "distanceMeters": 50,
                            "totalStrokeCount": 30,
                            "poolsSwum": 2,
                            "poolUnits": "POOL_UNIT_METERS",
                            "poolLength": 25,
                        }
                    },
                    "laps": {
                        "laps": [
                            {
                                "splitTimeMillis": 70000,
                                "durationMillis": 70000,
                                "distanceMeters": 50,
                                "statistics": {"swimmingStatistics": {"poolsSwum": 2, "strokes": 30}},
                            }
                        ]
                    },
                    "samples": {
                        "samples": [
                            {"type": "DISTANCE", "intervalMillis": 1000, "values": [0, 25, 50]},
                            {"type": "HEART_RATE", "intervalMillis": 1000, "values": [100, 110, 120]},
                        ],
                        "swimmingPhases": {
                            "phases": [
                                {"startOffsetMillis": 0, "durationMillis": 30000, "style": "FREESTYLE", "strokes": 14},
                                {"startOffsetMillis": 40000, "durationMillis": 30000, "style": "BREASTSTROKE", "strokes": 16},
                            ]
                        },
                    },
                }
            ],
        },
    )

    assert activity is not None
    assert activity.metadata["polarSport"] == "POOL_SWIMMING"
    assert activity.metadata["swimming"] == {
        "poolLengthMeters": 25.0,
        "distanceMeters": 50.0,
        "poolsSwum": 2,
        "totalStrokeCount": 30,
        "poolUnits": "POOL_UNIT_METERS",
        "phases": [
            {"startOffsetMillis": 0.0, "durationMillis": 30000.0, "strokes": 14, "style": "FREESTYLE"},
            {"startOffsetMillis": 40000.0, "durationMillis": 30000.0, "strokes": 16, "style": "BREASTSTROKE"},
        ],
        "laps": [{"splitTimeMillis": 70000.0, "durationMillis": 70000.0, "distanceMeters": 50.0, "poolsSwum": 2, "strokes": 30}],
    }


def test_maps_known_and_unknown_sports():
    assert map_sport_to_tcx("ROAD_CYCLING") == "Biking"
    assert map_sport_to_tcx("MOUNTAIN_BIKING") == "Biking"
    assert map_sport_to_tcx("5") == "Biking"
    assert map_sport_to_tcx("1") == "Running"
    assert map_sport_to_tcx("2") == "Biking"
    assert map_sport_to_tcx("3") == "Other"
    assert map_sport_to_tcx("4") == "Running"
    assert map_sport_to_tcx("15") == "Other"
    assert map_sport_to_tcx("17") == "Running"
    assert map_sport_to_tcx("56") == "Other"
    assert map_sport_to_tcx("103") == "Other"
    assert map_sport_to_tcx("110") == "Other"
    assert map_sport_to_tcx("104") == "Other"
    assert map_sport_to_tcx("109") == "Other"
    assert map_sport_to_tcx("94") == "Other"
    assert map_sport_to_display("MOUNTAIN_BIKING") == "Jazda na rowerze górskim"
    assert map_sport_to_display("5") == "Jazda na rowerze górskim"
    assert map_sport_to_display("15") == "Strength training"
    assert map_sport_to_display("56") == "Fitness martial arts"
    assert map_sport_to_display("103") == "Pool swimming"
    assert map_sport_to_display("110") == "Kickboxing martial arts"
    assert map_sport_to_display("195") == "Gravel"
    assert map_sport_to_display("94") == "Wall climbing"
    assert map_sport_to_display("95") == "Kayaking"
    assert map_sport_to_display("109") == "Boxing"
    assert map_sport_to_polar_kind("5") == "MOUNTAIN_BIKING"
    assert map_sport_to_polar_kind("15") == "STRENGTH_TRAINING"
    assert map_sport_to_polar_kind("17") == "TREADMILL_RUNNING"
    assert map_sport_to_polar_kind("56") == "FITNESS_MARTIAL_ARTS"
    assert map_sport_to_polar_kind("103") == "POOL_SWIMMING"
    assert map_sport_to_polar_kind("110") == "KICKBOXING_MARTIAL_ARTS"
    assert map_sport_to_polar_kind("94") == "VERTICALSPORTS_WALLCLIMBING"
    assert map_sport_to_polar_kind("109") == "BOXING"
    assert map_sport_to_polar_kind("34") == "HIIT"
    assert map_sport_to_polar_kind("186") == "ULTIMATE"
    assert map_sport_to_polar_kind("203") == "RUCKING"
    assert map_sport_to_tcx("strength_training") == "Other"
    assert map_sport_to_tcx("something_new") == "Other"


def test_numeric_sport_ids_match_polar_flow_tsv():
    sports_tsv = Path(__file__).parents[2] / "ogolna_lista_sportow.tsv"
    rows = csv.DictReader(sports_tsv.read_text(encoding="utf-8").splitlines(), delimiter="\t")

    for row in rows:
        expected = row["name"].strip().upper().replace("-", "_").replace(" ", "_")
        assert map_sport_to_polar_kind(row["id"]) == expected
