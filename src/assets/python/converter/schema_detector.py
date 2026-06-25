from __future__ import annotations

import re
from math import isfinite
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable


@dataclass
class TrainingStructure:
    has_start_time: bool = False
    has_sport: bool = False
    has_timeline: bool = False
    has_gps: bool = False
    has_heart_rate: bool = False
    has_distance: bool = False
    has_calories: bool = False
    confidence: int = 0
    warnings: list[str] = field(default_factory=list)

    @property
    def looks_like_training(self) -> bool:
        return self.confidence >= 4 and self.has_timeline and self.has_start_time


START_KEYS = {
    "starttime",
    "startdatetime",
    "startdate",
    "start",
    "exercisestarttime",
    "recordingstarttime",
}
TIMEZONE_OFFSET_KEYS = {"timezoneoffsetminutes"}
SPORT_KEYS = {"sport", "sportname", "sportprofile", "activitytype", "exercisetype", "type"}
DURATION_KEYS = {"duration", "durationseconds", "totaltimeseconds", "elapsedtime", "elapsedseconds"}
DURATION_MILLIS_KEYS = {"durationmillis", "elapsedmillis", "totaltimemillis"}
DISTANCE_KEYS = {"distance", "distancemeters", "totaldistance", "totaldistancemeters"}
CALORIE_KEYS = {"calories", "calorie", "kcal", "energy"}
TIME_KEYS = {"time", "timestamp", "datetime", "date", "recordedtime", "sampletime"}
OFFSET_KEYS = {"secondsfromstart", "offsetseconds", "offset", "elapsedseconds"}
ROUTE_ELAPSED_MILLIS_KEYS = {"elapsedmillis", "offsetmillis", "timeinmillis"}
LAT_KEYS = {"lat", "latitude", "latitudedegrees"}
LON_KEYS = {"lon", "lng", "longitude", "longitudedegrees"}
HR_KEYS = {"heartrate", "heart_rate", "hr", "bpm"}
CADENCE_KEYS = {"cadence", "cyclingcadence", "runningcadence"}
POWER_KEYS = {"power", "watts", "powerwatts"}
SPEED_KEYS = {"speed", "speedmps", "velocity"}
ALTITUDE_KEYS = {"altitude", "altitudemeters", "elevation"}
TEMP_KEYS = {"temperature", "temperaturecelsius", "temp"}


def normalized_key(key: str) -> str:
    return re.sub(r"[^a-z0-9]", "", key.lower())


def detect_training_structure(data: Any) -> TrainingStructure:
    keys = set(_walk_keys(data))
    sample_dicts = list(_walk_sample_dicts(data))
    structure = TrainingStructure()

    structure.has_start_time = any(k in START_KEYS for k in keys)
    structure.has_sport = any(k in SPORT_KEYS for k in keys)
    structure.has_distance = any(k in DISTANCE_KEYS for k in keys)
    structure.has_calories = any(k in CALORIE_KEYS for k in keys)
    has_polar_series = _has_polar_series_samples(data)
    structure.has_timeline = any(_dict_has_time(sample) for sample in sample_dicts) or has_polar_series
    structure.has_gps = any(_dict_has_gps(sample) for sample in sample_dicts) or bool(candidate_route_waypoint_lists(data))
    structure.has_heart_rate = any(_dict_has_any(sample, HR_KEYS) for sample in sample_dicts) or _has_polar_series_type(data, {"HEART_RATE"})
    structure.has_distance = structure.has_distance or _has_polar_series_type(data, {"DISTANCE"})

    structure.confidence = sum(
        [
            2 if structure.has_timeline else 0,
            1 if structure.has_start_time else 0,
            1 if structure.has_sport else 0,
            1 if structure.has_distance else 0,
            1 if structure.has_gps else 0,
            1 if structure.has_heart_rate else 0,
        ]
    )

    if not structure.has_timeline:
        structure.warnings.append("Nie wykryto osi czasu treningu.")
    if not structure.has_start_time:
        structure.warnings.append("Nie wykryto czasu startu aktywności.")
    return structure


def first_value_by_keys(data: Any, candidates: set[str]) -> Any:
    for key, value in _walk_items(data):
        if normalized_key(key) in candidates and value not in (None, ""):
            return value
    return None


def all_values_by_keys(data: Any, candidates: set[str]) -> list[Any]:
    values: list[Any] = []
    for key, value in _walk_items(data):
        if normalized_key(key) in candidates and value not in (None, ""):
            values.append(value)
    return values


def candidate_trackpoint_lists(data: Any) -> list[list[dict[str, Any]]]:
    candidates: list[list[dict[str, Any]]] = []
    for value in _walk_values(data):
        if isinstance(value, list):
            dicts = [item for item in value if isinstance(item, dict)]
            if len(dicts) >= 1 and any(_dict_has_time(item) for item in dicts):
                candidates.append(dicts)
    candidates.sort(key=lambda items: _sample_score(items), reverse=True)
    return candidates


def candidate_polar_series_lists(data: Any) -> list[list[dict[str, Any]]]:
    candidates: list[list[dict[str, Any]]] = []
    for value in _walk_values(data):
        if isinstance(value, list):
            dicts = [item for item in value if isinstance(item, dict)]
            if dicts and all(_is_polar_series_sample(item) for item in dicts):
                candidates.append(dicts)
    candidates.sort(key=lambda items: sum(len(item.get("values", [])) for item in items if isinstance(item.get("values"), list)), reverse=True)
    return candidates


def candidate_route_waypoint_lists(data: Any) -> list[list[dict[str, Any]]]:
    candidates: list[list[dict[str, Any]]] = []
    for value in _walk_values(data):
        if isinstance(value, list):
            dicts = [item for item in value if isinstance(item, dict)]
            if dicts and any(_dict_has_gps(item) for item in dicts) and any(_dict_has_route_time(item) for item in dicts):
                candidates.append(dicts)
    candidates.sort(key=len, reverse=True)
    return candidates


def parse_datetime(value: Any, timezone_offset_minutes: int | float | None = None) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        timestamp = float(value)
        if not isfinite(timestamp):
            return None
        if timestamp > 10_000_000_000:
            timestamp /= 1000
        return datetime.fromtimestamp(timestamp, tz=timezone.utc)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        has_explicit_timezone = text.endswith("Z") or bool(re.search(r"[+-]\d{2}:?\d{2}$", text))
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(text)
        except ValueError:
            return None
        if parsed.tzinfo is None:
            if timezone_offset_minutes is not None and not has_explicit_timezone:
                parsed = parsed.replace(tzinfo=timezone(timedelta(minutes=float(timezone_offset_minutes))))
            else:
                parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    return None


def parse_duration_seconds(value: Any) -> float | None:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        seconds = float(value)
        return seconds if isfinite(seconds) else None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if text.startswith("PT"):
            return _parse_iso_duration(text)
        if ":" in text:
            parts = [float(part) for part in text.split(":")]
            if not all(isfinite(part) for part in parts):
                return None
            if len(parts) == 3:
                return parts[0] * 3600 + parts[1] * 60 + parts[2]
            if len(parts) == 2:
                return parts[0] * 60 + parts[1]
        try:
            seconds = float(text)
            return seconds if isfinite(seconds) else None
        except ValueError:
            return None
    return None


def numeric(value: Any) -> float | None:
    if value in (None, ""):
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
        return number if isfinite(number) else None
    if isinstance(value, str):
        try:
            number = float(value.strip().replace(",", "."))
            return number if isfinite(number) else None
        except ValueError:
            return None
    return None


def integer(value: Any) -> int | None:
    number = numeric(value)
    if number is None:
        return None
    return int(round(number))


def value_from_dict(data: dict[str, Any], candidates: set[str]) -> Any:
    for key, value in data.items():
        if normalized_key(key) in candidates and value not in (None, ""):
            return value
    for value in data.values():
        if isinstance(value, dict):
            nested = value_from_dict(value, candidates)
            if nested not in (None, ""):
                return nested
    return None


def sample_time(sample: dict[str, Any], start_time: datetime | None) -> datetime | None:
    absolute = value_from_dict(sample, TIME_KEYS)
    parsed = parse_datetime(absolute)
    if parsed:
        return parsed
    if start_time is None:
        return None
    # Polar-like exports sometimes store sample offsets instead of absolute timestamps.
    offset = parse_duration_seconds(value_from_dict(sample, OFFSET_KEYS))
    if offset is None:
        return None
    return start_time + timedelta(seconds=offset)


def _walk_items(data: Any) -> Iterable[tuple[str, Any]]:
    if isinstance(data, dict):
        for key, value in data.items():
            yield key, value
            yield from _walk_items(value)
    elif isinstance(data, list):
        for item in data:
            yield from _walk_items(item)


def _walk_values(data: Any) -> Iterable[Any]:
    yield data
    if isinstance(data, dict):
        for value in data.values():
            yield from _walk_values(value)
    elif isinstance(data, list):
        for item in data:
            yield from _walk_values(item)


def _walk_keys(data: Any) -> Iterable[str]:
    for key, _ in _walk_items(data):
        yield normalized_key(key)


def _walk_sample_dicts(data: Any) -> Iterable[dict[str, Any]]:
    for value in _walk_values(data):
        if isinstance(value, dict) and (_dict_has_time(value) or _dict_has_gps(value) or _dict_has_any(value, HR_KEYS)):
            yield value


def _dict_has_any(data: dict[str, Any], candidates: set[str]) -> bool:
    return value_from_dict(data, candidates) not in (None, "")


def _dict_has_time(data: dict[str, Any]) -> bool:
    return _dict_has_any(data, TIME_KEYS) or _dict_has_any(data, OFFSET_KEYS)


def _dict_has_gps(data: dict[str, Any]) -> bool:
    return _dict_has_any(data, LAT_KEYS) and _dict_has_any(data, LON_KEYS)


def _dict_has_route_time(data: dict[str, Any]) -> bool:
    return _dict_has_any(data, ROUTE_ELAPSED_MILLIS_KEYS)


def _is_polar_series_sample(data: dict[str, Any]) -> bool:
    return isinstance(data.get("values"), list) and "type" in data and "intervalMillis" in data


def _has_polar_series_samples(data: Any) -> bool:
    return any(isinstance(value, dict) and _is_polar_series_sample(value) for value in _walk_values(data))


def _has_polar_series_type(data: Any, sample_types: set[str]) -> bool:
    for value in _walk_values(data):
        if isinstance(value, dict) and _is_polar_series_sample(value):
            sample_type = str(value.get("type", "")).upper()
            if sample_type in sample_types:
                return True
    return False


def _sample_score(items: list[dict[str, Any]]) -> int:
    score = 0
    for item in items[:10]:
        score += 2 if _dict_has_time(item) else 0
        score += 2 if _dict_has_gps(item) else 0
        score += 1 if _dict_has_any(item, HR_KEYS) else 0
        score += 1 if _dict_has_any(item, DISTANCE_KEYS) else 0
    return score


def _parse_iso_duration(value: str) -> float | None:
    match = re.fullmatch(
        r"PT(?:(?P<hours>\d+(?:\.\d+)?)H)?(?:(?P<minutes>\d+(?:\.\d+)?)M)?(?:(?P<seconds>\d+(?:\.\d+)?)S)?",
        value,
    )
    if not match:
        return None
    hours = float(match.group("hours") or 0)
    minutes = float(match.group("minutes") or 0)
    seconds = float(match.group("seconds") or 0)
    return hours * 3600 + minutes * 60 + seconds
