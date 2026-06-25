import json
from pathlib import Path

from converter.main import classify_files
from converter.models import PolarFileCategory, PolarFileKind
from converter.polar_file_classifier import classify_polar_file

FIXTURES = Path(__file__).parents[1] / "fixtures"


def load_fixture(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def test_classifies_training_session_as_convertible():
    result = classify_polar_file("training-session-001.json", load_fixture("training-session-sample-with-gps-hr.json"))
    assert result.kind == PolarFileKind.TRAINING_SESSION
    assert result.category == PolarFileCategory.TRAINING_SESSION
    assert result.confidence == "high"
    assert "sport" in result.detected_keys
    assert result.is_convertible is True


def test_classifies_activity_as_skipped_non_training():
    result = classify_polar_file("activity-2024-05-04.json", load_fixture("activity-sample.json"))
    assert result.kind == PolarFileKind.ACTIVITY
    assert result.category == PolarFileCategory.DAILY_ACTIVITY
    assert result.is_convertible is False


def test_classifies_account_data_as_sensitive_skipped():
    result = classify_polar_file("account-data.json", load_fixture("account-data-sample.json"))
    assert result.kind == PolarFileKind.ACCOUNT_DATA
    assert result.category == PolarFileCategory.ACCOUNT_DATA
    assert result.is_convertible is False
    assert "Dane konta" in (result.reason or "")


def test_classifies_account_profile_as_sensitive_skipped():
    result = classify_polar_file("account-profile.json", load_fixture("account-profile-sample.json"))
    assert result.kind == PolarFileKind.ACCOUNT_PROFILE
    assert result.category == PolarFileCategory.ACCOUNT_DATA
    assert result.is_convertible is False
    assert "Profil konta" in (result.reason or "")


def test_classifies_additional_polar_support_files_as_non_training():
    samples = [
        ("247-ohr_2024.json", PolarFileKind.OHR_SENSOR),
        ("247ohr_2024.json", PolarFileKind.OHR_SENSOR),
        ("ppi_samples_2025.json", PolarFileKind.OHR_SENSOR),
        ("product_devices-2024.json", PolarFileKind.PRODUCT_DEVICES),
        ("products-devices-2024.json", PolarFileKind.PRODUCT_DEVICES),
        ("sleep-results-2024.json", PolarFileKind.SLEEP_RESULTS),
        ("sleep_result_2024.json", PolarFileKind.SLEEP_RESULTS),
        ("sleep_score_2024.json", PolarFileKind.SLEEP_RESULTS),
        ("nightly_recovery_2024.json", PolarFileKind.SLEEP_RESULTS),
        ("sport-profiles-2024.json", PolarFileKind.SPORT_PROFILES),
        ("calendar-items-2024.json", PolarFileKind.CALENDAR_ITEMS),
    ]
    for filename, kind in samples:
        result = classify_polar_file(filename, {"items": []})
        assert result.kind == kind
        assert result.is_convertible is False


def test_classifies_trening_sesison_typo_as_training_candidate():
    result = classify_polar_file("trening-sesison-001.json", load_fixture("training-session-sample-with-gps-hr.json"))
    assert result.kind == PolarFileKind.TRAINING_SESSION
    assert result.is_convertible is True


def test_classifies_numeric_prefix_as_needs_analysis_when_schema_unknown():
    result = classify_polar_file("1234567890-export.json", load_fixture("numeric-prefix-sample.json"))
    assert result.kind == PolarFileKind.NUMERIC_PREFIX_JSON
    assert result.category == PolarFileCategory.UNKNOWN_NUMERIC
    assert result.is_convertible is False


def test_classifies_numeric_prefix_with_training_fields_as_training_heuristic():
    result = classify_polar_file(
        "1234567890-export.json",
        {
            "sport": "RUNNING",
            "startTime": "2024-05-01T10:00:00Z",
            "duration": "PT10M",
            "samples": [{"time": "2024-05-01T10:00:00Z", "heartRate": 120}],
        },
    )
    assert result.kind == PolarFileKind.NUMERIC_PREFIX_JSON
    assert result.category == PolarFileCategory.TRAINING_SESSION
    assert result.confidence == "medium"
    assert result.is_convertible is True
    assert "heurystyka" in (result.reason or "")
    assert {"sport", "duration", "samples", "heartRate"}.issubset(set(result.detected_keys))


def test_classifies_sleep_or_wellness_fields():
    result = classify_polar_file(
        "wellness-export.json",
        {
            "sleepStart": "2024-05-01T22:00:00Z",
            "sleepEnd": "2024-05-02T06:00:00Z",
            "sleepScore": 82,
            "nightlyRecharge": "good",
        },
    )
    assert result.kind == PolarFileKind.UNKNOWN_JSON
    assert result.category == PolarFileCategory.SLEEP_OR_WELLNESS
    assert result.confidence == "medium"
    assert result.is_convertible is False


def test_classifies_unknown_json():
    result = classify_polar_file("other-export.json", load_fixture("unknown-sample.json"))
    assert result.kind == PolarFileKind.UNKNOWN_JSON
    assert result.category == PolarFileCategory.UNKNOWN_JSON
    assert result.is_convertible is False


def test_classifies_invalid_json_in_public_api():
    invalid_text = (FIXTURES / "invalid-json-sample.json").read_text(encoding="utf-8")
    result = classify_files([{"filename": "export/training-session-broken.json", "jsonText": invalid_text}])[0]
    assert result["kind"] == PolarFileKind.INVALID_JSON.value
    assert result["category"] == PolarFileCategory.INVALID_JSON.value
    assert result["path"] == "export/training-session-broken.json"
    assert result["filename"] == "training-session-broken.json"
    assert result["status"] == "invalid"
