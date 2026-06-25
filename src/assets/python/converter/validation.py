from __future__ import annotations

from datetime import datetime
import xml.etree.ElementTree as ET
from typing import Any

from .models import Activity
from .models import TrackPoint
from .models import basename
from .models import to_utc_iso
from .sport_mapping import is_known_polar_sport


def validate_activity_for_tcx(activity: Activity) -> list[str]:
    report = validate_activity_for_garmin(activity)
    return report["warnings"] + report["errors"]


def validate_activity_for_garmin(activity: Activity, path: str | None = None) -> dict[str, Any]:
    warnings: list[str] = []
    errors: list[str] = []
    trackpoints = activity.trackpoints or []
    valid_gps_count = sum(1 for point in trackpoints if _has_valid_gps(point))
    has_hr_samples = any(point.heart_rate is not None for point in trackpoints)

    if activity.start_time is None:
        errors.append("Brak start_time.")

    if not trackpoints:
        errors.append("Brak trackpointów.")
    else:
        _validate_trackpoint_times(trackpoints, errors)

    duration = _activity_duration(activity)
    if duration is None:
        errors.append("Brak duration_seconds i nie da się go wyliczyć z trackpointów.")
    elif duration < 0:
        errors.append(f"duration_seconds nie może być ujemne: {_format_value(duration)} s.")

    if activity.distance_meters is not None and activity.distance_meters < 0:
        errors.append(f"Dystans aktywności nie może być ujemny: {_format_value(activity.distance_meters)} m.")

    for index, point in enumerate(trackpoints):
        _validate_trackpoint_values(index, point, warnings, errors)

    if trackpoints and valid_gps_count == 0:
        warnings.append("Import możliwy, ale brakuje GPS.")

    if trackpoints and not has_hr_samples:
        warnings.append("Brak tętna.")

    polar_sport = str(activity.metadata.get("polarSport") or activity.metadata.get("rawSport") or activity.sport or "")
    if not is_known_polar_sport(polar_sport):
        warnings.append(f"Nieznany sport Polar: {_unknown_sport_label(activity)}; użyto fallbacku TCX Other / FIT generic.")

    if not activity.laps and (activity.start_time is None or duration is None):
        errors.append("Nie można wyliczyć lap/session dla Garmin.")

    warnings = _unique_messages(warnings)
    errors = _unique_messages(errors)
    status = _status(warnings, errors)
    possible_formats = ["tcx", "fit"] if status != "error" else []
    report = {
        "path": path or activity.source_filename,
        "filename": basename(path or activity.source_filename),
        "sourceFileKind": activity.source_file_kind,
        "activityId": activity.activity_id,
        "sport": activity.sport,
        "sportDetail": activity.sport_detail,
        "startTime": to_utc_iso(activity.start_time) if activity.start_time else None,
        "status": status,
        "message": _message(status, warnings, errors),
        "possibleFormats": possible_formats,
        "hasGps": valid_gps_count > 0,
        "hasHeartRate": has_hr_samples,
        "trackpointCount": len(trackpoints),
        "warnings": warnings,
        "errors": errors,
        "formatValidations": [
            _format_validation("tcx", status, "pre_export", len(trackpoints), warnings, errors),
            _format_validation("fit", status, "pre_export", len(trackpoints), warnings, errors),
        ],
    }
    return report


def garmin_ready_error(
    filename: str,
    source_file_kind: str,
    errors: list[str],
    warnings: list[str] | None = None,
    status: str = "error",
) -> dict[str, Any]:
    clean_warnings = _unique_messages(warnings or [])
    clean_errors = _unique_messages(errors)
    return {
        "path": filename,
        "filename": basename(filename),
        "sourceFileKind": source_file_kind,
        "activityId": None,
        "sport": "Other",
        "sportDetail": None,
        "startTime": None,
        "status": status,
        "message": _message(status, clean_warnings, clean_errors),
        "possibleFormats": [],
        "hasGps": False,
        "hasHeartRate": False,
        "trackpointCount": 0,
        "warnings": clean_warnings,
        "errors": clean_errors,
        "formatValidations": [
            _format_validation("tcx", status, "pre_export", 0, clean_warnings, clean_errors),
            _format_validation("fit", status, "pre_export", 0, clean_warnings, clean_errors),
        ],
    }


def _unknown_sport_label(activity: Activity) -> str:
    raw_sport = activity.metadata.get("rawSport")
    if raw_sport not in (None, ""):
        return _short_value(raw_sport)

    polar_sport = activity.metadata.get("polarSport")
    if polar_sport not in (None, "", "UNKNOWN"):
        return _short_value(polar_sport)

    return "brak sportu w danych źródłowych"


def _short_value(value: Any) -> str:
    text = str(value)
    return text if len(text) <= 80 else f"{text[:77]}..."


def validate_tcx_export(content: str, expected_trackpoints: int) -> dict[str, Any]:
    warnings: list[str] = []
    errors: list[str] = []
    record_count = 0

    try:
        root = ET.fromstring(content)
    except ET.ParseError as exc:
        return _format_validation("tcx", "error", "xml_structure", 0, [], [f"Wynik TCX nie jest poprawnym XML-em: {exc}."])

    if _local_name(root.tag) != "TrainingCenterDatabase":
        errors.append("TCX nie zawiera TrainingCenterDatabase jako root.")

    activity = _first(root, "Activity")
    if _first(root, "Activities") is None or activity is None:
        errors.append("TCX nie zawiera Activities/Activity.")

    activity_id = _first(activity, "Id") if activity is not None else None
    if activity_id is None or not _text(activity_id):
        errors.append("TCX nie zawiera Id.")
    elif not _is_iso_datetime(_text(activity_id)):
        errors.append("TCX Id nie jest datą ISO 8601.")

    laps = _all(root, "Lap")
    if not laps:
        errors.append("TCX nie zawiera Lap.")
    for lap in laps:
        start_time = lap.attrib.get("StartTime", "")
        if not start_time:
            errors.append("TCX Lap nie ma StartTime.")
        elif not _is_iso_datetime(start_time):
            errors.append("TCX Lap StartTime nie jest datą ISO 8601.")

    trackpoints = _all(root, "Trackpoint")
    record_count = len(trackpoints)
    if expected_trackpoints > 0 and record_count == 0:
        errors.append("TCX nie zawiera Trackpoint mimo trackpointów w aktywności.")

    for point in trackpoints:
        time_node = _first(point, "Time")
        if time_node is None or not _text(time_node):
            errors.append("TCX Trackpoint nie ma Time.")
        elif not _is_iso_datetime(_text(time_node)):
            errors.append("TCX Trackpoint Time nie jest datą ISO 8601.")

    errors = _unique_messages(errors)
    status = _status(warnings, errors)
    return _format_validation("tcx", status, "xml_structure", record_count, warnings, errors)


def merge_format_validation(report: dict[str, Any], validation: dict[str, Any]) -> dict[str, Any]:
    next_report = dict(report)
    existing = [
        item
        for item in next_report.get("formatValidations", [])
        if item.get("format") != validation.get("format") or item.get("validationLevel") == "pre_export"
    ]
    next_report["formatValidations"] = [*existing, validation]
    warnings = _unique_messages([*next_report.get("warnings", []), *validation.get("warnings", [])])
    errors = _unique_messages([*next_report.get("errors", []), *validation.get("errors", [])])
    next_report["warnings"] = warnings
    next_report["errors"] = errors
    next_report["status"] = _status(warnings, errors)
    next_report["message"] = _message(next_report["status"], warnings, errors)
    if next_report["status"] == "error":
        next_report["possibleFormats"] = []
    return next_report


def _validate_trackpoint_times(trackpoints: list[TrackPoint], errors: list[str]) -> None:
    timestamps: list[datetime] = []
    seen: set[str] = set()
    duplicates: set[str] = set()
    for point in trackpoints:
        if point.time is None:
            errors.append("Trackpoint bez poprawnego czasu.")
            continue
        timestamps.append(point.time)
        key = to_utc_iso(point.time)
        if key in seen:
            duplicates.add(key)
        seen.add(key)

    if timestamps != sorted(timestamps):
        errors.append("Niepoprawne timestampy: trackpointy nie są posortowane po czasie.")
    if duplicates:
        errors.append("Duplikaty timestampów trackpointów.")


def _validate_trackpoint_values(index: int, point: TrackPoint, warnings: list[str], errors: list[str]) -> None:
    label = f"trackpoint {index + 1}"
    if point.latitude is not None and not -90 <= point.latitude <= 90:
        errors.append(f"Nieprawidłowa szerokość geograficzna w {label}: {_format_value(point.latitude)}.")
    if point.longitude is not None and not -180 <= point.longitude <= 180:
        errors.append(f"Nieprawidłowa długość geograficzna w {label}: {_format_value(point.longitude)}.")
    if point.distance_meters is not None and point.distance_meters < 0:
        errors.append(f"Dystans w {label} nie może być ujemny: {_format_value(point.distance_meters)} m.")
    if point.heart_rate is not None:
        if point.heart_rate < 0:
            errors.append(f"Tętno w {label} nie może być ujemne: {point.heart_rate} bpm.")
        elif point.heart_rate < 20:
            warnings.append(
                f"Tętno w {label} jest poniżej realistycznego zakresu: {point.heart_rate} bpm. "
                "Eksport nie jest blokowany; może to oznaczać chwilowy brak odczytu czujnika."
            )
        elif point.heart_rate > 250:
            errors.append(f"Tętno w {label} jest poza realistycznym zakresem: {point.heart_rate} bpm.")
    if point.cadence is not None and point.cadence < 0:
        errors.append(f"Kadencja w {label} nie może być ujemna: {point.cadence}.")
    if point.power_watts is not None and point.power_watts < 0:
        errors.append(f"Moc w {label} nie może być ujemna: {point.power_watts} W.")
    if point.speed_mps is not None and point.speed_mps < 0:
        errors.append(f"Prędkość w {label} nie może być ujemna: {_format_value(point.speed_mps)} m/s.")


def _activity_duration(activity: Activity) -> float | None:
    if activity.duration_seconds is not None:
        return activity.duration_seconds
    if activity.trackpoints and activity.start_time:
        return max((activity.trackpoints[-1].time - activity.start_time).total_seconds(), 0)
    return None


def _has_valid_gps(point: TrackPoint) -> bool:
    return (
        point.latitude is not None
        and point.longitude is not None
        and -90 <= point.latitude <= 90
        and -180 <= point.longitude <= 180
    )


def _format_value(value: float | int) -> str:
    if isinstance(value, int):
        return str(value)
    text = f"{value:.6f}"
    return text.rstrip("0").rstrip(".") if "." in text else text


def _format_validation(
    format_name: str,
    status: str,
    validation_level: str,
    record_count: int | None,
    warnings: list[str],
    errors: list[str],
) -> dict[str, Any]:
    return {
        "format": format_name,
        "status": status,
        "validationLevel": validation_level,
        "recordCount": record_count,
        "warnings": _unique_messages(warnings),
        "errors": _unique_messages(errors),
    }


def _status(warnings: list[str], errors: list[str]) -> str:
    if errors:
        return "error"
    if warnings:
        return "warning"
    return "ready"


def _message(status: str, warnings: list[str], errors: list[str]) -> str:
    if status == "ready":
        return "Gotowe do importu Garmin Connect"
    if status == "warning":
        return warnings[0] if warnings else "Import możliwy z ostrzeżeniami."
    if status == "unsupported":
        return errors[0] if errors else "Nieobsługiwany format JSON"
    return errors[0] if errors else "Błąd walidacji Garmin-ready."


def _first(root: ET.Element | None, local_name: str) -> ET.Element | None:
    if root is None:
        return None
    for element in root.iter():
        if _local_name(element.tag) == local_name:
            return element
    return None


def _all(root: ET.Element, local_name: str) -> list[ET.Element]:
    return [element for element in root.iter() if _local_name(element.tag) == local_name]


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _text(element: ET.Element) -> str:
    return (element.text or "").strip()


def _is_iso_datetime(value: str) -> bool:
    if not value:
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return True


def _unique_messages(messages: list[str]) -> list[str]:
    unique: list[str] = []
    seen: set[str] = set()
    for message in messages:
        if not message or message in seen:
            continue
        unique.append(message)
        seen.add(message)
    return unique
