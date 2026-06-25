from __future__ import annotations

from datetime import datetime
from datetime import timedelta
from typing import Any

from .models import Activity, Lap, TrackPoint
from .schema_detector import (
    ALTITUDE_KEYS,
    CADENCE_KEYS,
    CALORIE_KEYS,
    DISTANCE_KEYS,
    DURATION_KEYS,
    DURATION_MILLIS_KEYS,
    HR_KEYS,
    LAT_KEYS,
    LON_KEYS,
    POWER_KEYS,
    ROUTE_ELAPSED_MILLIS_KEYS,
    SPEED_KEYS,
    SPORT_KEYS,
    START_KEYS,
    TEMP_KEYS,
    TIMEZONE_OFFSET_KEYS,
    candidate_polar_series_lists,
    candidate_route_waypoint_lists,
    candidate_trackpoint_lists,
    first_value_by_keys,
    integer,
    numeric,
    parse_datetime,
    parse_duration_seconds,
    normalized_key,
    sample_time,
    value_from_dict,
)
from .sport_mapping import sport_mapping_for


ID_KEYS = {"id", "activityid", "exerciseid", "sessionid", "trainingid"}


def parse_polar_activity(filename: str, source_file_kind: str, data: dict[str, Any] | list[Any]) -> tuple[Activity | None, list[str]]:
    warnings: list[str] = []
    start_time = parse_datetime(first_value_by_keys(data, START_KEYS), _timezone_offset_minutes(data))
    if start_time is None:
        return None, ["Brak start_time."]

    raw_sport = _sport_value(data)
    sport_mapping = sport_mapping_for(_sport_identifier(raw_sport))
    duration_seconds = _activity_duration_seconds(data)
    distance_meters = numeric(first_value_by_keys(data, DISTANCE_KEYS))
    calories = integer(first_value_by_keys(data, CALORIE_KEYS))
    activity_id = _string_or_none(first_value_by_keys(data, ID_KEYS))

    trackpoints = _parse_trackpoints(data, start_time, warnings)
    if not trackpoints:
        warnings.append("Nie wykryto trackpointów z czasem; TCX może zostać odrzucony przez Garmin Connect.")
    trackpoints.sort(key=lambda item: item.time)

    hr_values = [tp.heart_rate for tp in trackpoints if tp.heart_rate is not None]
    average_heart_rate = int(round(sum(hr_values) / len(hr_values))) if hr_values else None
    max_heart_rate = max(hr_values) if hr_values else None

    if distance_meters is None:
        distances = [tp.distance_meters for tp in trackpoints if tp.distance_meters is not None]
        if distances:
            distance_meters = max(distances)

    if duration_seconds is None and trackpoints:
        duration_seconds = max((trackpoints[-1].time - start_time).total_seconds(), 0)

    lap = Lap(
        start_time=start_time,
        total_time_seconds=duration_seconds,
        distance_meters=distance_meters,
        calories=calories,
        average_heart_rate=average_heart_rate,
        max_heart_rate=max_heart_rate,
    )
    metadata = {"rawSport": raw_sport, "polarSport": sport_mapping.polar_sport}
    swimming_metadata = _swimming_metadata(data)
    if swimming_metadata:
        metadata["swimming"] = swimming_metadata

    activity = Activity(
        source="Polar Flow",
        source_filename=filename,
        source_file_kind=source_file_kind,
        activity_id=activity_id,
        sport=sport_mapping.tcx_sport,
        start_time=start_time,
        sport_detail=sport_mapping.display_name,
        duration_seconds=duration_seconds,
        distance_meters=distance_meters,
        calories=calories,
        average_heart_rate=average_heart_rate,
        max_heart_rate=max_heart_rate,
        trackpoints=trackpoints,
        laps=[lap],
        metadata=metadata,
    )
    return activity, warnings


def _parse_trackpoints(data: Any, start_time: datetime, warnings: list[str]) -> list[TrackPoint]:
    polar_series = _parse_polar_series_trackpoints(data, start_time)
    route_points = _parse_route_waypoints(data, start_time, warnings)
    if polar_series:
        return _merge_route_into_trackpoints(polar_series, route_points, start_time)
    if route_points:
        return route_points

    lists = candidate_trackpoint_lists(data)
    if not lists:
        return []

    trackpoints: list[TrackPoint] = []
    for sample in lists[0]:
        timestamp = sample_time(sample, start_time)
        if timestamp is None:
            continue
        latitude = numeric(value_from_dict(sample, LAT_KEYS))
        longitude = numeric(value_from_dict(sample, LON_KEYS))

        trackpoints.append(
            TrackPoint(
                time=timestamp,
                latitude=latitude,
                longitude=longitude,
                altitude_meters=numeric(value_from_dict(sample, ALTITUDE_KEYS)),
                distance_meters=numeric(value_from_dict(sample, DISTANCE_KEYS)),
                heart_rate=integer(value_from_dict(sample, HR_KEYS)),
                cadence=integer(value_from_dict(sample, CADENCE_KEYS)),
                speed_mps=numeric(value_from_dict(sample, SPEED_KEYS)),
                power_watts=integer(value_from_dict(sample, POWER_KEYS)),
                temperature_celsius=numeric(value_from_dict(sample, TEMP_KEYS)),
            )
        )
    return trackpoints


def _activity_duration_seconds(data: Any) -> float | None:
    containers = _activity_level_containers(data)
    for container in containers:
        duration_millis = _direct_value_by_keys(container, DURATION_MILLIS_KEYS)
        parsed_millis = numeric(duration_millis)
        if parsed_millis is not None:
            return parsed_millis / 1000

    for container in containers:
        duration_value = _direct_value_by_keys(container, DURATION_KEYS)
        parsed_seconds = parse_duration_seconds(duration_value)
        if parsed_seconds is not None:
            return parsed_seconds

    duration_value = first_value_by_keys(data, DURATION_KEYS)
    parsed_seconds = parse_duration_seconds(duration_value)
    if parsed_seconds is not None:
        return parsed_seconds

    duration_millis = numeric(first_value_by_keys(data, DURATION_MILLIS_KEYS))
    return duration_millis / 1000 if duration_millis is not None else None


def _timezone_offset_minutes(data: Any) -> float | None:
    return numeric(first_value_by_keys(data, TIMEZONE_OFFSET_KEYS))


def _sport_identifier(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, dict):
        for key in ("id", "sport", "name", "value"):
            nested = value.get(key)
            if nested not in (None, ""):
                return str(nested)
        return None
    return str(value)


def _sport_value(data: Any) -> Any:
    sport_ids: list[Any] = []
    for value in _values_for_key(data, "sport"):
        if isinstance(value, dict):
            nested = value.get("id")
            if nested not in (None, ""):
                sport_ids.append(nested)
        elif value not in (None, ""):
            sport_ids.append(value)

    for value in sport_ids:
        if str(value).strip().isdigit():
            return value
    if sport_ids:
        return sport_ids[0]
    return first_value_by_keys(data, SPORT_KEYS)


def _swimming_metadata(data: Any) -> dict[str, Any] | None:
    metadata: dict[str, Any] = {}
    containers = _activity_level_containers(data)

    for container in containers:
        statistics = container.get("statistics")
        if not isinstance(statistics, dict):
            continue
        swimming_statistics = statistics.get("swimmingStatistics")
        if not isinstance(swimming_statistics, dict):
            continue
        _assign_number(metadata, "poolLengthMeters", swimming_statistics.get("poolLength"))
        _assign_number(metadata, "distanceMeters", swimming_statistics.get("distanceMeters"))
        _assign_integer(metadata, "poolsSwum", swimming_statistics.get("poolsSwum"))
        _assign_integer(metadata, "totalStrokeCount", swimming_statistics.get("totalStrokeCount"))
        pool_units = swimming_statistics.get("poolUnits")
        if isinstance(pool_units, str) and pool_units:
            metadata["poolUnits"] = pool_units
        break

    phases = _swimming_phases(containers)
    if phases:
        metadata["phases"] = phases

    laps = _swimming_laps(containers)
    if laps:
        metadata["laps"] = laps

    return metadata or None


def _swimming_phases(containers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for container in containers:
        samples = container.get("samples")
        if not isinstance(samples, dict):
            continue
        swimming_phases = samples.get("swimmingPhases")
        if not isinstance(swimming_phases, dict):
            continue
        phases = swimming_phases.get("phases")
        if not isinstance(phases, list):
            continue

        parsed: list[dict[str, Any]] = []
        for phase in phases:
            if not isinstance(phase, dict):
                continue
            item: dict[str, Any] = {}
            _assign_number(item, "startOffsetMillis", phase.get("startOffsetMillis"))
            _assign_number(item, "durationMillis", phase.get("durationMillis"))
            _assign_integer(item, "strokes", phase.get("strokes"))
            style = phase.get("style")
            if isinstance(style, str) and style:
                item["style"] = style
            if "startOffsetMillis" in item and "durationMillis" in item:
                parsed.append(item)
        if parsed:
            return parsed
    return []


def _swimming_laps(containers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for container in containers:
        laps_container = container.get("laps")
        if not isinstance(laps_container, dict):
            continue
        laps = laps_container.get("laps")
        if not isinstance(laps, list):
            continue

        parsed: list[dict[str, Any]] = []
        for lap in laps:
            if not isinstance(lap, dict):
                continue
            item: dict[str, Any] = {}
            _assign_number(item, "splitTimeMillis", lap.get("splitTimeMillis"))
            _assign_number(item, "durationMillis", lap.get("durationMillis"))
            _assign_number(item, "distanceMeters", lap.get("distanceMeters"))
            statistics = lap.get("statistics")
            if isinstance(statistics, dict):
                swimming_statistics = statistics.get("swimmingStatistics")
                if isinstance(swimming_statistics, dict):
                    _assign_integer(item, "poolsSwum", swimming_statistics.get("poolsSwum"))
                    _assign_integer(item, "strokes", swimming_statistics.get("strokes"))
            if "durationMillis" in item or "splitTimeMillis" in item or "distanceMeters" in item:
                parsed.append(item)
        if parsed:
            return parsed
    return []


def _assign_number(target: dict[str, Any], key: str, value: Any) -> None:
    parsed = numeric(value)
    if parsed is not None:
        target[key] = parsed


def _assign_integer(target: dict[str, Any], key: str, value: Any) -> None:
    parsed = integer(value)
    if parsed is not None:
        target[key] = parsed


def _values_for_key(data: Any, wanted_key: str) -> list[Any]:
    values: list[Any] = []
    if isinstance(data, dict):
        for key, value in data.items():
            if normalized_key(key) == wanted_key:
                values.append(value)
            values.extend(_values_for_key(value, wanted_key))
    elif isinstance(data, list):
        for item in data:
            values.extend(_values_for_key(item, wanted_key))
    return values


def _activity_level_containers(data: Any) -> list[dict[str, Any]]:
    containers: list[dict[str, Any]] = []
    if isinstance(data, dict):
        containers.append(data)
        exercises = data.get("exercises")
        if isinstance(exercises, list):
            containers.extend(item for item in exercises if isinstance(item, dict))
    return containers


def _direct_value_by_keys(data: dict[str, Any], candidates: set[str]) -> Any:
    for key, value in data.items():
        if normalized_key(key) in candidates and value not in (None, ""):
            return value
    return None


def _parse_route_waypoints(data: Any, start_time: datetime, warnings: list[str]) -> list[TrackPoint]:
    lists = candidate_route_waypoint_lists(data)
    if not lists:
        return []

    route_points: list[TrackPoint] = []
    for waypoint in lists[0]:
        latitude = numeric(value_from_dict(waypoint, LAT_KEYS))
        longitude = numeric(value_from_dict(waypoint, LON_KEYS))
        if latitude is None or longitude is None:
            continue

        timestamp = _route_waypoint_time(waypoint, start_time)
        if timestamp is None:
            continue
        route_points.append(
            TrackPoint(
                time=timestamp,
                latitude=latitude,
                longitude=longitude,
                altitude_meters=numeric(value_from_dict(waypoint, ALTITUDE_KEYS)),
                distance_meters=numeric(value_from_dict(waypoint, DISTANCE_KEYS)),
            )
        )
    return route_points


def _parse_polar_series_trackpoints(data: Any, start_time: datetime) -> list[TrackPoint]:
    lists = candidate_polar_series_lists(data)
    if not lists:
        return []

    series = lists[0]
    max_len = max((len(item.get("values", [])) for item in series if isinstance(item.get("values"), list)), default=0)
    if max_len == 0:
        return []

    default_interval_millis = numeric(series[0].get("intervalMillis")) or 1000
    trackpoints: list[TrackPoint] = []
    for index in range(max_len):
        point = TrackPoint(time=start_time + _seconds_delta(index, default_interval_millis))
        for item in series:
            values = item.get("values")
            if not isinstance(values, list) or index >= len(values):
                continue
            sample_type = str(item.get("type", "")).upper()
            value = values[index]
            if sample_type == "DISTANCE":
                point.distance_meters = numeric(value)
            elif sample_type == "HEART_RATE":
                point.heart_rate = integer(value)
            elif sample_type == "ALTITUDE":
                point.altitude_meters = numeric(value)
            elif sample_type == "SPEED":
                point.speed_mps = _speed_kmh_to_mps(numeric(value))
            elif sample_type == "TEMPERATURE":
                point.temperature_celsius = numeric(value)
            elif sample_type == "CADENCE":
                point.cadence = integer(value)
            elif sample_type == "POWER":
                point.power_watts = integer(value)
        trackpoints.append(point)
    return trackpoints


def _merge_route_into_trackpoints(base: list[TrackPoint], route_points: list[TrackPoint], start_time: datetime) -> list[TrackPoint]:
    if not route_points:
        return base
    by_elapsed_millis = {_elapsed_millis(point.time, start_time): point for point in base}
    matched = 0
    unmatched: list[TrackPoint] = []

    for route_point in route_points:
        base_point = by_elapsed_millis.get(_elapsed_millis(route_point.time, start_time))
        if base_point is None:
            unmatched.append(route_point)
            continue
        _copy_route_fields(base_point, route_point)
        matched += 1

    if matched == 0:
        for base_point, route_point in zip(base, route_points):
            _copy_route_fields(base_point, route_point)
        return base

    merged = [*base, *unmatched]
    merged.sort(key=lambda item: item.time)
    return merged


def _copy_route_fields(base_point: TrackPoint, route_point: TrackPoint) -> None:
    base_point.latitude = route_point.latitude
    base_point.longitude = route_point.longitude
    if route_point.altitude_meters is not None:
        base_point.altitude_meters = route_point.altitude_meters
    if base_point.distance_meters is None:
        base_point.distance_meters = route_point.distance_meters


def _speed_kmh_to_mps(value: float | None) -> float | None:
    return value / 3.6 if value is not None else None


def _route_waypoint_time(waypoint: dict[str, Any], start_time: datetime) -> datetime | None:
    elapsed_millis = numeric(value_from_dict(waypoint, ROUTE_ELAPSED_MILLIS_KEYS))
    if elapsed_millis is not None:
        return start_time + timedelta(milliseconds=elapsed_millis)
    return sample_time(waypoint, start_time)


def _elapsed_millis(value: datetime, start_time: datetime) -> int:
    return int(round((value - start_time).total_seconds() * 1000))


def _seconds_delta(index: int, interval_millis: float):
    return timedelta(milliseconds=index * interval_millis)


def _string_or_none(value: Any) -> str | None:
    if value in (None, ""):
        return None
    return str(value)
