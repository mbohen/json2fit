import json
from pathlib import Path

from converter.main import classify_files, convert_to_tcx
from converter.validation import validate_tcx_export

FIXTURES = Path(__file__).parents[1] / "fixtures"


def fixture_text(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def classify_data(data: dict, filename: str = "training-session-validator.json") -> dict:
    return classify_files([{"filename": filename, "jsonText": json.dumps(data)}])[0]


def test_garmin_ready_running_with_gps_and_hr_is_ready():
    result = classify_files(
        [
            {
                "filename": "training-session-gps.json",
                "jsonText": fixture_text("training-session-sample-with-gps-hr.json"),
            }
        ]
    )[0]

    assert result["garminReady"]["status"] == "ready"
    assert result["garminReady"]["possibleFormats"] == ["tcx", "fit"]
    assert result["garminReady"]["hasGps"] is True
    assert result["garminReady"]["hasHeartRate"] is True


def test_garmin_ready_without_gps_is_warning_not_error():
    result = classify_files(
        [
            {
                "filename": "training-session-no-gps.json",
                "jsonText": fixture_text("training-session-sample-without-gps.json"),
            }
        ]
    )[0]

    assert result["garminReady"]["status"] == "warning"
    assert result["garminReady"]["hasGps"] is False
    assert result["garminReady"]["errors"] == []
    assert any("GPS" in warning for warning in result["garminReady"]["warnings"])


def test_garmin_ready_missing_start_time_is_error():
    result = classify_data(
        {
            "sport": "RUNNING",
            "durationSeconds": 60,
            "samples": [{"secondsFromStart": 0, "heartRate": 120}],
        }
    )

    assert result["garminReady"]["status"] == "error"
    assert "Brak start_time" in " ".join(result["garminReady"]["errors"])


def test_garmin_ready_missing_trackpoints_is_error():
    result = classify_data(
        {
            "sport": "RUNNING",
            "startTime": "2024-05-01T10:00:00Z",
            "durationSeconds": 60,
            "distanceMeters": 100,
        }
    )

    assert result["garminReady"]["status"] == "error"
    assert "Brak trackpointów" in " ".join(result["garminReady"]["errors"])


def test_garmin_ready_invalid_coordinates_are_error():
    result = classify_data(
        {
            "sport": "RUNNING",
            "startTime": "2024-05-01T10:00:00Z",
            "durationSeconds": 60,
            "samples": [
                {"secondsFromStart": 0, "latitude": 120, "longitude": 0.001, "heartRate": 120},
                {"secondsFromStart": 60, "latitude": 0.002, "longitude": 0.002, "heartRate": 130},
            ],
        }
    )

    assert result["garminReady"]["status"] == "error"
    errors = " ".join(result["garminReady"]["errors"])
    assert "szerokość geograficzna" in errors
    assert "120" in errors


def test_garmin_ready_negative_distance_is_error():
    result = classify_data(
        {
            "sport": "RUNNING",
            "startTime": "2024-05-01T10:00:00Z",
            "durationSeconds": 60,
            "distanceMeters": -1,
            "samples": [
                {"secondsFromStart": 0, "latitude": 0.001, "longitude": 0.001, "heartRate": 120},
                {"secondsFromStart": 60, "latitude": 0.002, "longitude": 0.002, "heartRate": 130},
            ],
        }
    )

    assert result["garminReady"]["status"] == "error"
    errors = " ".join(result["garminReady"]["errors"])
    assert "Dystans aktywności" in errors
    assert "-1" in errors


def test_garmin_ready_invalid_heart_rate_reports_value():
    result = classify_data(
        {
            "sport": "RUNNING",
            "startTime": "2024-05-01T10:00:00Z",
            "durationSeconds": 60,
            "samples": [
                {"secondsFromStart": 0, "latitude": 0.001, "longitude": 0.001, "heartRate": 500},
                {"secondsFromStart": 60, "latitude": 0.002, "longitude": 0.002, "heartRate": 130},
            ],
        }
    )

    errors = " ".join(result["garminReady"]["errors"])
    assert result["garminReady"]["status"] == "error"
    assert "Tętno w trackpoint 1" in errors
    assert "500 bpm" in errors


def test_garmin_ready_zero_heart_rate_is_warning_not_error():
    result = classify_data(
        {
            "sport": "RUNNING",
            "startTime": "2024-05-01T10:00:00Z",
            "durationSeconds": 60,
            "samples": [
                {"secondsFromStart": 0, "latitude": 0.001, "longitude": 0.001, "heartRate": 0},
                {"secondsFromStart": 60, "latitude": 0.002, "longitude": 0.002, "heartRate": 130},
            ],
        }
    )

    warnings = " ".join(result["garminReady"]["warnings"])
    assert result["garminReady"]["status"] == "warning"
    assert result["garminReady"]["errors"] == []
    assert result["garminReady"]["hasHeartRate"] is True
    assert "Tętno w trackpoint 1" in warnings
    assert "0 bpm" in warnings


def test_unknown_sport_warns_and_falls_back_to_other_generic():
    result = classify_data(
        {
            "sport": "SOMETHING_NEW",
            "startTime": "2024-05-01T10:00:00Z",
            "durationSeconds": 60,
            "samples": [
                {"secondsFromStart": 0, "latitude": 0.001, "longitude": 0.001, "heartRate": 120},
                {"secondsFromStart": 60, "latitude": 0.002, "longitude": 0.002, "heartRate": 130},
            ],
        }
    )

    assert result["activity"]["sport"] == "Other"
    assert result["garminReady"]["status"] == "warning"
    warning_text = " ".join(result["garminReady"]["warnings"])
    assert "Nieznany sport Polar: SOMETHING_NEW" in warning_text
    assert "fallbacku TCX Other / FIT generic" in warning_text


def test_missing_sport_warning_names_missing_source_value():
    result = classify_data(
        {
            "startTime": "2024-05-01T10:00:00Z",
            "durationSeconds": 60,
            "samples": [
                {"secondsFromStart": 0, "latitude": 0.001, "longitude": 0.001, "heartRate": 120},
                {"secondsFromStart": 60, "latitude": 0.002, "longitude": 0.002, "heartRate": 130},
            ],
        }
    )

    assert "Nieznany sport Polar: brak sportu w danych źródłowych" in " ".join(result["garminReady"]["warnings"])


def test_tcx_export_attaches_structural_validation():
    result = convert_to_tcx(
        {
            "filename": "training-session-gps.json",
            "jsonText": fixture_text("training-session-sample-with-gps-hr.json"),
        }
    )

    assert result["status"] == "success"
    validations = result["garminReady"]["formatValidations"]
    assert any(item["format"] == "tcx" and item["validationLevel"] == "xml_structure" for item in validations)


def test_tcx_validation_rejects_missing_critical_nodes():
    validation = validate_tcx_export(
        """
        <TrainingCenterDatabase>
          <Activities>
            <Activity Sport="Running">
              <Lap StartTime="not-a-date" />
            </Activity>
          </Activities>
        </TrainingCenterDatabase>
        """,
        expected_trackpoints=1,
    )

    assert validation["status"] == "error"
    assert "Id" in " ".join(validation["errors"])
    assert "StartTime" in " ".join(validation["errors"])
    assert "Trackpoint" in " ".join(validation["errors"])
