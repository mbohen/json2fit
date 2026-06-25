import json
import xml.etree.ElementTree as ET
from pathlib import Path

from converter.main import classify_files, classify_files_json, convert_to_tcx, convert_to_tcx_json, normalize_activity

FIXTURES = Path(__file__).parents[1] / "fixtures"
NS = {"tcx": "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"}


def fixture_text(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def test_generates_valid_tcx_xml_with_namespace():
    result = convert_to_tcx(
        {
            "filename": "training-session-gps.json",
            "jsonText": fixture_text("training-session-sample-with-gps-hr.json"),
        }
    )
    assert result["status"] == "success"
    root = ET.fromstring(result["content"])
    assert root.tag == "{http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2}TrainingCenterDatabase"
    assert root.find(".//tcx:Activity", NS) is not None


def test_tcx_uses_utc_dates_and_sorted_trackpoints():
    result = convert_to_tcx(
        {
            "filename": "training-session-gps.json",
            "jsonText": fixture_text("training-session-sample-with-gps-hr.json"),
        }
    )
    root = ET.fromstring(result["content"])
    times = [node.text for node in root.findall(".//tcx:Trackpoint/tcx:Time", NS)]
    assert times == sorted(times)
    assert all(time.endswith("Z") for time in times if time)


def test_tcx_omits_empty_position_when_gps_missing():
    result = convert_to_tcx(
        {
            "filename": "training-session-no-gps.json",
            "jsonText": fixture_text("training-session-sample-without-gps.json"),
        }
    )
    root = ET.fromstring(result["content"])
    assert root.find(".//tcx:Position", NS) is None
    assert root.find(".//tcx:HeartRateBpm/tcx:Value", NS) is not None


def test_account_data_is_not_convertible():
    result = convert_to_tcx(
        {
            "filename": "account-data.json",
            "jsonText": fixture_text("account-data-sample.json"),
        }
    )
    assert result["status"] == "error"
    assert result["content"] == ""


def test_classify_files_includes_activity_summary_for_ready_training():
    result = classify_files(
        [
            {
                "filename": "training-session-gps.json",
                "jsonText": fixture_text("training-session-sample-with-gps-hr.json"),
            }
        ]
    )[0]
    assert result["status"] == "ready"
    assert result["activity"]["trackpointCount"] == 3


def test_normalize_activity_includes_full_trackpoints_for_fit_export():
    result = normalize_activity(
        {
            "filename": "training-session-gps.json",
            "jsonText": fixture_text("training-session-sample-with-gps-hr.json"),
        }
    )

    assert result["status"] == "success"
    assert result["activity"]["trackpointCount"] == 3
    assert len(result["activity"]["trackpoints"]) == 3
    assert result["activity"]["trackpoints"][0]["latitude"] == 0.001
    assert result["activity"]["trackpoints"][0]["heartRate"] == 120
    assert result["activity"]["laps"][0]["totalTimeSeconds"] == 1200


def test_public_json_api_never_emits_nan_tokens():
    payload = json.dumps(
        [
            {
                "filename": "training-session-nan.json",
                "jsonText": json.dumps(
                    {
                        "id": "nan-regression",
                        "sport": "RUNNING",
                        "startTime": "2024-05-01T10:00:00Z",
                        "durationSeconds": 60,
                        "distanceMeters": float("nan"),
                        "samples": [
                            {"secondsFromStart": 0, "distanceMeters": "NaN", "heartRate": 120},
                            {"secondsFromStart": 60, "distanceMeters": 1000, "heartRate": 130},
                        ],
                    }
                ),
            }
        ]
    )

    result_json = classify_files_json(payload)
    assert "NaN" not in result_json
    parsed = json.loads(result_json)
    assert parsed[0]["activity"]["distanceMeters"] == 1000


def test_convert_json_api_never_emits_nan_tokens():
    payload = json.dumps(
        {
            "filename": "training-session-nan.json",
            "jsonText": json.dumps(
                {
                    "id": "nan-regression",
                    "sport": "RUNNING",
                    "startTime": "2024-05-01T10:00:00Z",
                    "durationSeconds": 60,
                    "distanceMeters": "NaN",
                    "samples": [
                        {"secondsFromStart": 0, "distanceMeters": "NaN", "heartRate": 120},
                        {"secondsFromStart": 60, "distanceMeters": 1000, "heartRate": 130},
                    ],
                }
            ),
        }
    )

    result_json = convert_to_tcx_json(payload)
    assert "NaN" not in result_json
    parsed = json.loads(result_json)
    assert parsed["status"] == "success"


def test_tcx_contains_position_from_polar_route_waypoints():
    result = convert_to_tcx(
        {
            "filename": "training-session-route.json",
            "jsonText": json.dumps(
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
                }
            ),
        }
    )

    assert result["status"] == "success"
    assert not any("Brak danych GPS" in warning for warning in result["warnings"])
    root = ET.fromstring(result["content"])
    assert root.find(".//tcx:Position", NS) is not None


def test_tcx_uses_polar_timezone_offset_numeric_sport_and_altitude_series():
    result = convert_to_tcx(
        {
            "filename": "training-session-timezone.json",
            "jsonText": json.dumps(
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
                }
            ),
        }
    )

    root = ET.fromstring(result["content"])
    activity = root.find(".//tcx:Activity", NS)
    assert activity is not None
    assert activity.attrib["Sport"] == "Biking"
    assert root.find(".//tcx:Activity/tcx:Notes", NS).text == "Polar sport: Jazda na rowerze górskim"
    assert root.find(".//tcx:Activity/tcx:Id", NS).text == "2026-05-10T11:20:00Z"
    assert len(root.findall(".//tcx:Trackpoint/tcx:AltitudeMeters", NS)) == 2
