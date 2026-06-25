from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from .models import PolarFileCategory, PolarFileKind
from .polar_file_classifier import classify_polar_file
from .schema_detector import normalized_key, numeric, parse_datetime, parse_duration_seconds


DATE_KEYS = {"date", "day", "night", "calendardate", "activitydate"}
TIME_KEYS = {"time", "timestamp", "datetime", "created", "updated"}
DAILY_KEYS = {
    "steps",
    "stepcount",
    "calories",
    "kcal",
    "energy",
    "activetime",
    "activeminutes",
    "activetimeminutes",
    "distance",
    "stepsdistance",
    "distancemeters",
    "activitygoal",
    "dailyactivity",
}
SLEEP_KEYS = {
    "sleep",
    "sleepstart",
    "sleepend",
    "sleepduration",
    "sleepspan",
    "duration",
    "actualsleep",
    "actualsleepduration",
    "asleepduration",
    "sleepscore",
    "sleepscoreresult",
    "continuity",
    "continuityscore",
    "deepsleep",
    "lightsleep",
    "remsleep",
    "interruptions",
    "avgheartrate",
    "averageheartrate",
    "avghrv",
    "breathingrate",
    "hypnogram",
    "sleepstages",
}
NIGHTLY_KEYS = {
    "nightlyrecharge",
    "recharge",
    "rechargestatus",
    "ans",
    "anscharge",
    "ansrate",
    "ansstatus",
    "hrv",
    "avghrv",
    "meannightlyrecoveryrmssd",
    "meannightlyrecoveryrri",
    "breathingrate",
    "meannightlyrecoveryrespirationinterval",
    "recoveryindicator",
}
HEART_RATE_KEYS = {
    "heartrate",
    "restingheartrate",
    "averageheartrate",
    "avgheartrate",
    "minheartrate",
    "maxheartrate",
}
STAGE_CONTAINER_KEYS = {"sleepstages", "hypnogram", "stages"}
STAGE_NAME_KEYS = {"stage", "type", "name", "level", "sleepstage"}
STAGE_START_KEYS = {"start", "starttime", "sleepstagebegin", "begin"}
STAGE_END_KEYS = {"end", "endtime", "sleepstageend", "finish"}
STAGE_DURATION_KEYS = {"duration", "durationminutes", "durationseconds", "minutes", "seconds"}
ACCOUNT_KINDS = {PolarFileKind.ACCOUNT_DATA, PolarFileKind.ACCOUNT_PROFILE}
TRAINING_KINDS = {PolarFileKind.TRAINING_SESSION}


def analyze_wellness_files(files: list[dict[str, Any]]) -> dict[str, Any]:
    report = _empty_report()

    for input_file in files:
        filename = str(input_file.get("filename") or "unknown.json")
        json_text = str(input_file.get("jsonText") or "")
        parsed, parse_error = _parse_json(json_text)
        if parse_error:
            _append_skipped(report, "invalid_json", filename, [parse_error])
            continue

        classification = classify_polar_file(filename, parsed, _file_size_bytes(input_file, json_text))
        if classification.kind in ACCOUNT_KINDS:
            _append_skipped(
                report,
                "account_data",
                filename,
                ["Plik danych konta/profilu nie jest analizowany jako wellness."],
            )
            continue
        if classification.kind in TRAINING_KINDS:
            continue

        candidates = _candidate_records(parsed, classification)
        if not candidates:
            continue

        for candidate in candidates:
            _analyze_candidate(report, filename, candidate)

    _finalize_report(report)
    return report


def _empty_report() -> dict[str, Any]:
    return {
        "dailyActivity": [],
        "sleepSummaries": [],
        "sleepStages": [],
        "nightlyRecharge": [],
        "dailyHeartRate": [],
        "undatedRecords": [],
        "skippedRecords": [],
        "warnings": [],
        "summary": {
            "dailyActivityDays": 0,
            "sleepNights": 0,
            "sleepStageRecords": 0,
            "nightlyRechargeDays": 0,
            "dailyHeartRateDays": 0,
            "dateStart": None,
            "dateEnd": None,
            "averageSleepScore": None,
            "averageSleepDurationMinutes": None,
            "warningCount": 0,
        },
    }


def _candidate_records(data: Any, classification: Any) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    seen: set[int] = set()

    def add(value: Any) -> None:
        if not isinstance(value, dict):
            return
        identity = id(value)
        if identity in seen:
            return
        seen.add(identity)
        candidates.append(value)

    if not _classification_supports_wellness(classification):
        return candidates

    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict) and _has_record_level_wellness_keys(item):
                add(item)
        return candidates

    if isinstance(data, dict):
        added_known_collection = False
        for key, value in data.items():
            if normalized_key(key) in {"devicedays", "days", "nights", "records"} and isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        add(item)
                        added_known_collection = True
        if not added_known_collection:
            add(data)

    return candidates


def _classification_supports_wellness(classification: Any) -> bool:
    return classification.category in {
        PolarFileCategory.DAILY_ACTIVITY,
        PolarFileCategory.SLEEP_OR_WELLNESS,
    } or classification.kind in {
        PolarFileKind.ACTIVITY,
        PolarFileKind.OHR_SENSOR,
        PolarFileKind.SLEEP_RESULTS,
    }


def _has_record_level_wellness_keys(data: dict[str, Any]) -> bool:
    keys = {normalized_key(key) for key in data.keys()}
    return bool(
        keys
        & (
            DAILY_KEYS
            | SLEEP_KEYS
            | NIGHTLY_KEYS
            | {"night", "devicedays"}
            | {"restingheartrate", "averageheartrate", "avgheartrate", "minheartrate", "maxheartrate"}
        )
    )


def _analyze_candidate(report: dict[str, Any], filename: str, data: dict[str, Any]) -> None:
    daily = _extract_daily_activity(data, filename)
    if daily:
        _merge_daily_record(report["dailyActivity"], daily, "daily_activity", report)

    sleep = _extract_sleep_summary(data, filename)
    if sleep:
        _merge_daily_record(report["sleepSummaries"], sleep, "sleep", report)
        report["sleepStages"].extend(_extract_sleep_stages(data, filename, sleep.get("date")))

    nightly = _extract_nightly_recharge(data, filename)
    if nightly:
        _merge_daily_record(report["nightlyRecharge"], nightly, "nightly_recharge", report)

    heart_rate = _extract_daily_heart_rate(data, filename)
    if heart_rate:
        _merge_daily_record(report["dailyHeartRate"], heart_rate, "daily_heart_rate", report)


def _extract_daily_activity(data: dict[str, Any], filename: str) -> dict[str, Any] | None:
    values = {
        "steps": _integer_by_keys(data, {"steps", "stepcount"}),
        "calories": _integer_by_keys(data, {"calories", "kcal", "energy"}),
        "activeTimeMinutes": _minutes_by_keys(data, {"activetimeminutes", "activeminutes", "activetime"}),
        "distanceMeters": _number_by_keys(data, {"distancemeters", "stepsdistance", "distance"}),
    }
    if not _has_any_value(values):
        return None
    date = _daily_date(data)
    record = _base_daily_record(date, filename)
    record.update(values)
    if date is None:
        record["warnings"].append("Brak daty aktywności dziennej; rekord pominięty w CSV.")
    return record


def _extract_sleep_summary(data: dict[str, Any], filename: str) -> dict[str, Any] | None:
    sleep_start = _iso_datetime_by_keys(data, {"sleepstart", "starttime", "start"})
    sleep_end = _iso_datetime_by_keys(data, {"sleepend", "endtime", "end"})
    values = {
        "sleepStart": sleep_start,
        "sleepEnd": sleep_end,
        "durationMinutes": _minutes_by_keys(
            data,
            {"sleepdurationminutes", "durationminutes", "sleepduration", "sleepspan"},
        ),
        "actualSleepMinutes": _minutes_by_keys(
            data,
            {"actualsleepminutes", "actualsleepduration", "actualsleep", "asleepduration"},
        ),
        "sleepScore": _number_by_keys(data, {"sleepscore", "score"}),
        "continuityScore": _number_by_keys(data, {"continuityscore", "continuity"}),
        "deepSleepMinutes": _minutes_by_keys(data, {"deepsleepminutes", "deepsleep", "deep", "n3"}),
        "lightSleepMinutes": _minutes_by_keys(data, {"lightsleepminutes", "lightsleep", "light"}),
        "remSleepMinutes": _minutes_by_keys(data, {"remsleepminutes", "remsleep", "rem"}),
        "interruptionsMinutes": _minutes_by_keys(data, {"interruptionsminutes", "interruptions", "wake"}),
        "avgHeartRate": _integer_by_keys(data, {"avgheartrate", "averageheartrate"}),
        "avgHrv": _number_by_keys(data, {"avghrv", "hrv"}),
        "breathingRate": _number_by_keys(data, {"breathingrate"}),
    }
    if not _has_any_value(values) or not _has_explicit_sleep_signal(data, values):
        return None
    date = _sleep_date(data, sleep_start, sleep_end)
    record = _base_daily_record(date, filename)
    record.update(values)
    if date is None:
        record["warnings"].append("Brak daty snu; rekord pominięty w CSV.")
    return record


def _extract_sleep_stages(data: dict[str, Any], filename: str, fallback_date: str | None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for stage_list in _stage_lists(data):
        for item in stage_list:
            if isinstance(item, dict):
                stage = _string_by_keys(item, STAGE_NAME_KEYS)
                if not stage:
                    continue
                start = _iso_datetime_by_keys(item, STAGE_START_KEYS)
                end = _iso_datetime_by_keys(item, STAGE_END_KEYS)
                date = _date_from_iso(start) or _date_from_iso(end) or fallback_date
                rows.append(
                    {
                        "date": date,
                        "stage": stage,
                        "startTime": start,
                        "endTime": end,
                        "durationMinutes": _minutes_by_keys(item, STAGE_DURATION_KEYS),
                        "sourceFile": filename,
                        "warnings": [] if date else ["Brak daty fazy snu; rekord pominięty w CSV."],
                    }
                )
            elif item not in (None, ""):
                rows.append(
                    {
                        "date": fallback_date,
                        "stage": str(item),
                        "startTime": None,
                        "endTime": None,
                        "durationMinutes": None,
                        "sourceFile": filename,
                        "warnings": ["Faza snu bez czasu i długości w źródle."],
                    }
                )
    return rows


def _extract_nightly_recharge(data: dict[str, Any], filename: str) -> dict[str, Any] | None:
    values = {
        "rechargeStatus": _string_by_keys(data, {"rechargestatus", "nightlyrecharge", "recharge", "status"}),
        "ansStatus": _string_by_keys(data, {"ansstatus"}),
        "ansCharge": _number_by_keys(data, {"anscharge", "ans", "ansrate", "recoveryindicator"}),
        "hrvMs": _number_by_keys(data, {"hrvms", "hrv", "avghrv", "meannightlyrecoveryrmssd"}),
        "avgHrv": _number_by_keys(data, {"avghrv", "meannightlyrecoveryrmssd"}),
        "breathingRate": _breathing_rate(data),
        "restingHeartRate": _integer_by_keys(data, {"restingheartrate"}),
    }
    if not _has_any_value(values):
        return None
    date = _daily_date(data)
    record = _base_daily_record(date, filename)
    record.update(values)
    if date is None:
        record["warnings"].append("Brak daty Nightly Recharge; rekord pominięty w CSV.")
    return record


def _has_explicit_sleep_signal(data: dict[str, Any], values: dict[str, Any]) -> bool:
    keys = {normalized_key(key) for key in data.keys()}
    if keys & {"night"} and keys & {"sleepresult", "sleepscoreresult", "evaluation"}:
        return True
    if values.get("sleepStart") or values.get("sleepEnd") or values.get("sleepScore") is not None:
        return True
    return bool(keys & {"sleepstages", "hypnogram"})


def _breathing_rate(data: dict[str, Any]) -> float | None:
    direct = _number_by_keys(data, {"breathingrate"})
    if direct is not None:
        return direct
    interval = _number_by_keys(data, {"meannightlyrecoveryrespirationinterval"})
    if interval is None or interval <= 0:
        return None
    if interval > 100:
        return round(60_000 / interval, 2)
    return round(60 / interval, 2)


def _extract_daily_heart_rate(data: dict[str, Any], filename: str) -> dict[str, Any] | None:
    heart_rates = _heart_rate_values(data)
    values = {
        "averageHeartRate": _integer_by_keys(data, {"averageheartrate", "avgheartrate"}),
        "restingHeartRate": _integer_by_keys(data, {"restingheartrate"}),
        "minHeartRate": _integer_by_keys(data, {"minheartrate"}),
        "maxHeartRate": _integer_by_keys(data, {"maxheartrate"}),
    }
    if heart_rates:
        values["averageHeartRate"] = values["averageHeartRate"] or int(round(sum(heart_rates) / len(heart_rates)))
        values["minHeartRate"] = values["minHeartRate"] or min(heart_rates)
        values["maxHeartRate"] = values["maxHeartRate"] or max(heart_rates)
    if not _has_any_value(values):
        return None
    date = _daily_date(data) or _date_from_first_timestamp(data)
    record = _base_daily_record(date, filename)
    record.update(values)
    if date is None:
        record["warnings"].append("Brak daty dziennego tętna; rekord pominięty w CSV.")
    return record


def _merge_daily_record(records: list[dict[str, Any]], incoming: dict[str, Any], record_type: str, report: dict[str, Any]) -> None:
    date = incoming.get("date")
    if not date:
        report["undatedRecords"].append({"recordType": record_type, **incoming})
        report["warnings"].extend(incoming.get("warnings", []))
        return

    existing = next((record for record in records if record.get("date") == date), None)
    if existing is None:
        records.append(incoming)
        return

    for source_file in incoming.get("sourceFiles", []):
        if source_file not in existing["sourceFiles"]:
            existing["sourceFiles"].append(source_file)

    for key, value in incoming.items():
        if key in {"date", "sourceFiles", "warnings"} or value in (None, ""):
            continue
        current = existing.get(key)
        if current in (None, ""):
            existing[key] = value
        elif current != value:
            _append_warning(
                existing,
                f"Konflikt pola {key} dla {date}: zachowano {current}, pominięto {value} z {', '.join(incoming.get('sourceFiles', []))}.",
            )

    for warning in incoming.get("warnings", []):
        _append_warning(existing, warning)


def _finalize_report(report: dict[str, Any]) -> None:
    for key in ("dailyActivity", "sleepSummaries", "nightlyRecharge", "dailyHeartRate"):
        report[key].sort(key=lambda item: item.get("date") or "")
        for record in report[key]:
            record["warnings"] = _unique(record.get("warnings", []))
            record["sourceFiles"] = _unique(record.get("sourceFiles", []))

    report["sleepStages"].sort(key=lambda item: (item.get("date") or "", item.get("startTime") or ""))
    report["warnings"] = _unique(
        [
            *report["warnings"],
            *_record_warnings(report["dailyActivity"]),
            *_record_warnings(report["sleepSummaries"]),
            *_record_warnings(report["sleepStages"]),
            *_record_warnings(report["nightlyRecharge"]),
            *_record_warnings(report["dailyHeartRate"]),
            *_record_warnings(report["undatedRecords"]),
        ]
    )

    dates = sorted(
        {
            item["date"]
            for collection in (
                report["dailyActivity"],
                report["sleepSummaries"],
                report["nightlyRecharge"],
                report["dailyHeartRate"],
            )
            for item in collection
            if item.get("date")
        }
    )
    sleep_scores = [item["sleepScore"] for item in report["sleepSummaries"] if item.get("sleepScore") is not None]
    sleep_durations = [
        item["durationMinutes"] for item in report["sleepSummaries"] if item.get("durationMinutes") is not None
    ]
    report["summary"] = {
        "dailyActivityDays": len(report["dailyActivity"]),
        "sleepNights": len(report["sleepSummaries"]),
        "sleepStageRecords": len([item for item in report["sleepStages"] if item.get("date")]),
        "nightlyRechargeDays": len(report["nightlyRecharge"]),
        "dailyHeartRateDays": len(report["dailyHeartRate"]),
        "dateStart": dates[0] if dates else None,
        "dateEnd": dates[-1] if dates else None,
        "averageSleepScore": _average(sleep_scores),
        "averageSleepDurationMinutes": _average(sleep_durations),
        "warningCount": len(report["warnings"]),
    }


def _base_daily_record(date: str | None, filename: str) -> dict[str, Any]:
    return {"date": date, "sourceFiles": [filename], "warnings": []}


def _daily_date(data: Any) -> str | None:
    return _date_from_value(_value_by_keys(data, DATE_KEYS))


def _sleep_date(data: Any, sleep_start: str | None, sleep_end: str | None) -> str | None:
    return _daily_date(data) or _date_from_iso(sleep_end) or _date_from_iso(sleep_start)


def _date_from_first_timestamp(data: Any) -> str | None:
    for key, value in _walk_items(data):
        if normalized_key(key) in TIME_KEYS:
            date = _date_from_value(value)
            if date:
                return date
    return None


def _date_from_value(value: Any) -> str | None:
    if value in (None, ""):
        return None
    parsed = parse_datetime(value)
    if parsed:
        return parsed.date().isoformat()
    if isinstance(value, str):
        text = value.strip()
        if len(text) >= 10:
            try:
                return datetime.fromisoformat(text[:10]).date().isoformat()
            except ValueError:
                return None
    return None


def _date_from_iso(value: str | None) -> str | None:
    return _date_from_value(value)


def _iso_datetime_by_keys(data: Any, keys: set[str]) -> str | None:
    parsed = parse_datetime(_value_by_keys(data, keys))
    return parsed.isoformat(timespec="seconds").replace("+00:00", "Z") if parsed else None


def _number_by_keys(data: Any, keys: set[str]) -> float | None:
    return numeric(_value_by_keys(data, keys))


def _integer_by_keys(data: Any, keys: set[str]) -> int | None:
    value = _number_by_keys(data, keys)
    return int(round(value)) if value is not None else None


def _minutes_by_keys(data: Any, keys: set[str]) -> float | None:
    key, value = _key_value_by_keys(data, keys)
    return _minutes_from_value(key, value)


def _minutes_from_value(key: str | None, value: Any) -> float | None:
    if value in (None, ""):
        return None
    normalized = normalized_key(key or "")
    if isinstance(value, str) and (value.startswith("PT") or ":" in value):
        seconds = parse_duration_seconds(value)
        return seconds / 60 if seconds is not None else None
    number = numeric(value)
    if number is None:
        return None
    if "minute" in normalized or normalized.endswith("minutes"):
        return number
    if "second" in normalized:
        return number / 60
    if "millis" in normalized:
        return number / 60_000
    if number > 24 * 60:
        return number / 60
    return number


def _string_by_keys(data: Any, keys: set[str]) -> str | None:
    value = _value_by_keys(data, keys)
    if isinstance(value, dict):
        for candidate in ("status", "value", "name", "state"):
            nested = value.get(candidate)
            if nested not in (None, ""):
                return str(nested)
        return None
    if value in (None, ""):
        return None
    return str(value)


def _value_by_keys(data: Any, keys: set[str]) -> Any:
    return _key_value_by_keys(data, keys)[1]


def _key_value_by_keys(data: Any, keys: set[str]) -> tuple[str | None, Any]:
    for key, value in _walk_items(data):
        if normalized_key(key) in keys and value not in (None, ""):
            return key, value
    return None, None


def _stage_lists(data: Any) -> list[list[Any]]:
    lists: list[list[Any]] = []
    for key, value in _walk_items(data):
        if normalized_key(key) in STAGE_CONTAINER_KEYS and isinstance(value, list):
            lists.append(value)
    return lists


def _heart_rate_values(data: Any) -> list[int]:
    values: list[int] = []
    for key, value in _walk_items(data):
        normalized = normalized_key(key)
        if normalized not in {"heartrate", "hr", "bpm"}:
            continue
        if isinstance(value, list):
            for item in value:
                number = numeric(item)
                if number is not None:
                    values.append(int(round(number)))
        else:
            number = numeric(value)
            if number is not None:
                values.append(int(round(number)))
    return values


def _has_any_value(values: dict[str, Any]) -> bool:
    return any(value not in (None, "") for value in values.values())


def _append_skipped(report: dict[str, Any], record_type: str, filename: str, warnings: list[str]) -> None:
    report["skippedRecords"].append(
        {
            "recordType": record_type,
            "sourceFile": filename,
            "warnings": warnings,
        }
    )


def _append_warning(record: dict[str, Any], warning: str) -> None:
    if warning and warning not in record["warnings"]:
        record["warnings"].append(warning)


def _record_warnings(records: list[dict[str, Any]]) -> list[str]:
    return [warning for record in records for warning in record.get("warnings", [])]


def _average(values: list[float]) -> float | None:
    if not values:
        return None
    return round(sum(values) / len(values), 2)


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


def _walk_items(data: Any):
    if isinstance(data, dict):
        for key, value in data.items():
            yield key, value
            yield from _walk_items(value)
    elif isinstance(data, list):
        for item in data:
            yield from _walk_items(item)


def _walk_values(data: Any):
    yield data
    if isinstance(data, dict):
        for value in data.values():
            yield from _walk_values(value)
    elif isinstance(data, list):
        for item in data:
            yield from _walk_values(item)


def _unique(values: list[str]) -> list[str]:
    unique: list[str] = []
    seen: set[str] = set()
    for value in values:
        if not value or value in seen:
            continue
        unique.append(value)
        seen.add(value)
    return unique
