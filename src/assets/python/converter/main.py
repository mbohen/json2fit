from __future__ import annotations

import json
from typing import Any

from .models import PolarFileKind
from .polar_file_classifier import classify_polar_file
from .polar_parser import parse_polar_activity
from .tcx_exporter import TcxExporter
from .validation import garmin_ready_error
from .validation import merge_format_validation
from .validation import validate_activity_for_garmin
from .validation import validate_tcx_export
from .wellness_parser import analyze_wellness_files as analyze_wellness_files_impl


def classify_files(files: list[dict[str, Any]]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for input_file in files:
        filename = input_file.get("filename", "unknown.json")
        json_text = input_file.get("jsonText", "")
        size_bytes = _file_size_bytes(input_file, json_text)
        parsed, parse_error = _parse_json(json_text)
        if parse_error:
            result = classify_polar_file(filename, None, size_bytes).to_dict()
            result["reason"] = "Niepoprawny JSON."
            result["warnings"] = [parse_error]
            result["kind"] = PolarFileKind.INVALID_JSON.value
            result["status"] = "invalid"
            result["garminReady"] = garmin_ready_error(
                filename,
                PolarFileKind.INVALID_JSON.value,
                [f"Nieobsługiwany format JSON: {parse_error}"],
                status="unsupported",
            )
            results.append(result)
            continue
        classification = classify_polar_file(filename, parsed, size_bytes)
        result = classification.to_dict()
        should_try_activity_parse = classification.is_convertible or classification.category.value == "training_session"
        if should_try_activity_parse:
            activity, warnings = parse_polar_activity(filename, classification.kind.value, parsed)
            if activity:
                result["activity"] = activity.to_summary_dict()
                result["warnings"] = result["warnings"] + warnings
                result["garminReady"] = validate_activity_for_garmin(activity, filename)
                if result["garminReady"]["status"] == "error":
                    result["isConvertible"] = False
            else:
                result["isConvertible"] = False
                result["status"] = "needs_analysis"
                result["warnings"] = result["warnings"] + warnings
                result["garminReady"] = garmin_ready_error(filename, classification.kind.value, warnings or result["warnings"])
        else:
            result["garminReady"] = garmin_ready_error(
                filename,
                classification.kind.value,
                [classification.reason or "Nieobsługiwany format JSON."],
                classification.warnings,
                status="unsupported",
            )
        results.append(result)
    return results


def convert_to_tcx(input_file: dict[str, str]) -> dict[str, Any]:
    filename = input_file.get("filename", "activity.json")
    parsed, parse_error = _parse_json(input_file.get("jsonText", ""))
    if parse_error:
        return _error_result(filename, [parse_error])

    classification = classify_polar_file(filename, parsed)
    if not classification.is_convertible:
        ready = garmin_ready_error(
            filename,
            classification.kind.value,
            [classification.reason or "Plik nie jest konwertowalny.", *classification.warnings],
            status="unsupported",
        )
        return _error_result(filename, [classification.reason or "Plik nie jest konwertowalny.", *classification.warnings], garmin_ready=ready)

    activity, parser_warnings = parse_polar_activity(filename, classification.kind.value, parsed)
    if activity is None:
        ready = garmin_ready_error(filename, classification.kind.value, parser_warnings)
        return _error_result(filename, parser_warnings, garmin_ready=ready)

    garmin_ready = validate_activity_for_garmin(activity, filename)
    warnings = _unique_messages([*classification.warnings, *parser_warnings, *garmin_ready["warnings"]])
    if garmin_ready["status"] == "error":
        return _error_result(filename, garmin_ready["errors"], warnings, activity.to_summary_dict(), garmin_ready)
    export = TcxExporter().export(activity)
    tcx_validation = validate_tcx_export(export.content, len(activity.trackpoints))
    garmin_ready = merge_format_validation(garmin_ready, tcx_validation)
    warnings = _unique_messages([*warnings, *export.warnings, *tcx_validation["warnings"]])
    if tcx_validation["errors"]:
        return _error_result(filename, tcx_validation["errors"], warnings, activity.to_summary_dict(), garmin_ready)
    return {
        "status": "success",
        "format": "tcx",
        "filename": export.filename,
        "mimeType": export.mime_type,
        "content": export.content,
        "warnings": warnings,
        "errors": [],
        "activity": activity.to_summary_dict(),
        "garminReady": garmin_ready,
    }


def convert_many_to_tcx(files: list[dict[str, str]]) -> list[dict[str, Any]]:
    return [convert_to_tcx(input_file) for input_file in files]


def normalize_activity(input_file: dict[str, str]) -> dict[str, Any]:
    filename = input_file.get("filename", "activity.json")
    parsed, parse_error = _parse_json(input_file.get("jsonText", ""))
    if parse_error:
        return _error_result(filename, [parse_error], mime_type="application/json")

    classification = classify_polar_file(filename, parsed)
    if not classification.is_convertible:
        ready = garmin_ready_error(
            filename,
            classification.kind.value,
            [classification.reason or "Plik nie jest konwertowalny.", *classification.warnings],
            status="unsupported",
        )
        return _error_result(
            filename,
            [classification.reason or "Plik nie jest konwertowalny.", *classification.warnings],
            mime_type="application/json",
            garmin_ready=ready,
        )

    activity, parser_warnings = parse_polar_activity(filename, classification.kind.value, parsed)
    if activity is None:
        ready = garmin_ready_error(filename, classification.kind.value, parser_warnings)
        return _error_result(filename, parser_warnings, mime_type="application/json", garmin_ready=ready)

    garmin_ready = validate_activity_for_garmin(activity, filename)
    warnings = _unique_messages([*classification.warnings, *parser_warnings, *garmin_ready["warnings"]])
    if garmin_ready["status"] == "error":
        return _error_result(
            filename,
            garmin_ready["errors"],
            warnings,
            activity.to_export_dict(),
            garmin_ready,
            mime_type="application/json",
        )

    return {
        "status": "success",
        "format": "json",
        "filename": filename,
        "mimeType": "application/json",
        "content": "",
        "warnings": warnings,
        "errors": [],
        "activity": activity.to_export_dict(),
        "garminReady": garmin_ready,
    }


def normalize_many_activities(files: list[dict[str, str]]) -> list[dict[str, Any]]:
    return [normalize_activity(input_file) for input_file in files]


def analyze_wellness_files(files: list[dict[str, Any]]) -> dict[str, Any]:
    return analyze_wellness_files_impl(files)


def classify_files_json(payload: str) -> str:
    return _to_browser_json(classify_files(json.loads(payload)))


def convert_to_tcx_json(payload: str) -> str:
    return _to_browser_json(convert_to_tcx(json.loads(payload)))


def convert_many_to_tcx_json(payload: str) -> str:
    return _to_browser_json(convert_many_to_tcx(json.loads(payload)))


def normalize_activity_json(payload: str) -> str:
    return _to_browser_json(normalize_activity(json.loads(payload)))


def normalize_many_activities_json(payload: str) -> str:
    return _to_browser_json(normalize_many_activities(json.loads(payload)))


def analyze_wellness_files_json(payload: str) -> str:
    return _to_browser_json(analyze_wellness_files(json.loads(payload)))


def _parse_json(json_text: str) -> tuple[Any | None, str | None]:
    try:
        return json.loads(json_text), None
    except json.JSONDecodeError as exc:
        return None, f"Niepoprawny JSON: {exc.msg}."


def _file_size_bytes(input_file: dict[str, Any], json_text: str) -> int:
    raw_size = input_file.get("size")
    if isinstance(raw_size, (int, float)) and raw_size >= 0:
        return int(raw_size)
    return len(json_text.encode("utf-8"))


def _to_browser_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False)


def _unique_messages(messages: list[str]) -> list[str]:
    unique: list[str] = []
    seen: set[str] = set()
    for message in messages:
        if not message or message in seen:
            continue
        unique.append(message)
        seen.add(message)
    return unique


def _error_result(
    filename: str,
    errors: list[str],
    warnings: list[str] | None = None,
    activity: dict[str, Any] | None = None,
    garmin_ready: dict[str, Any] | None = None,
    mime_type: str = "application/vnd.garmin.tcx+xml",
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "status": "error",
        "format": "tcx",
        "filename": filename,
        "mimeType": mime_type,
        "content": "",
        "warnings": _unique_messages(warnings or []),
        "errors": [error for error in errors if error],
    }
    if activity is not None:
        result["activity"] = activity
    if garmin_ready is not None:
        result["garminReady"] = garmin_ready
    return result
