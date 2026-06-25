from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any


class PolarFileKind(Enum):
    TRAINING_SESSION = "training_session"
    ACTIVITY = "activity"
    ACCOUNT_DATA = "account_data"
    ACCOUNT_PROFILE = "account_profile"
    OHR_SENSOR = "ohr_sensor"
    PRODUCT_DEVICES = "product_devices"
    SLEEP_RESULTS = "sleep_results"
    SPORT_PROFILES = "sport_profiles"
    CALENDAR_ITEMS = "calendar_items"
    NUMERIC_PREFIX_JSON = "numeric_prefix_json"
    UNKNOWN_JSON = "unknown_json"
    INVALID_JSON = "invalid_json"
    UNSUPPORTED = "unsupported"


class PolarFileCategory(Enum):
    TRAINING_SESSION = "training_session"
    DAILY_ACTIVITY = "daily_activity"
    SLEEP_OR_WELLNESS = "sleep_or_wellness"
    ACCOUNT_DATA = "account_data"
    UNKNOWN_NUMERIC = "unknown_numeric"
    UNKNOWN_JSON = "unknown_json"
    IGNORED_NON_JSON = "ignored_non_json"
    INVALID_JSON = "invalid_json"


@dataclass
class PolarFileClassification:
    filename: str
    kind: PolarFileKind
    is_convertible: bool
    reason: str | None
    warnings: list[str] = field(default_factory=list)
    path: str | None = None
    size_bytes: int = 0
    category: PolarFileCategory = PolarFileCategory.UNKNOWN_JSON
    confidence: str = "low"
    detected_keys: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        path = self.path or self.filename
        return {
            "path": path,
            "filename": basename(path),
            "sizeBytes": self.size_bytes,
            "category": self.category.value,
            "confidence": self.confidence,
            "reason": self.reason or "",
            "warnings": self.warnings,
            "detectedKeys": self.detected_keys,
            "kind": self.kind.value,
            "isConvertible": self.is_convertible,
            "status": classification_status(self.kind, self.is_convertible),
        }


@dataclass
class TrackPoint:
    time: datetime
    latitude: float | None = None
    longitude: float | None = None
    altitude_meters: float | None = None
    distance_meters: float | None = None
    heart_rate: int | None = None
    cadence: int | None = None
    speed_mps: float | None = None
    power_watts: int | None = None
    temperature_celsius: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "time": to_utc_iso(self.time),
            "latitude": self.latitude,
            "longitude": self.longitude,
            "altitudeMeters": self.altitude_meters,
            "distanceMeters": self.distance_meters,
            "heartRate": self.heart_rate,
            "cadence": self.cadence,
            "speedMps": self.speed_mps,
            "powerWatts": self.power_watts,
            "temperatureCelsius": self.temperature_celsius,
        }


@dataclass
class Lap:
    start_time: datetime
    total_time_seconds: float | None = None
    distance_meters: float | None = None
    calories: int | None = None
    average_heart_rate: int | None = None
    max_heart_rate: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "startTime": to_utc_iso(self.start_time),
            "totalTimeSeconds": self.total_time_seconds,
            "distanceMeters": self.distance_meters,
            "calories": self.calories,
            "averageHeartRate": self.average_heart_rate,
            "maxHeartRate": self.max_heart_rate,
        }


@dataclass
class Activity:
    source: str
    source_filename: str
    source_file_kind: str
    activity_id: str | None
    sport: str
    start_time: datetime
    sport_detail: str | None = None
    duration_seconds: float | None = None
    distance_meters: float | None = None
    calories: int | None = None
    average_heart_rate: int | None = None
    max_heart_rate: int | None = None
    trackpoints: list[TrackPoint] = field(default_factory=list)
    laps: list[Lap] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_summary_dict(self) -> dict[str, Any]:
        has_gps = any(tp.latitude is not None and tp.longitude is not None for tp in self.trackpoints)
        has_hr = any(tp.heart_rate is not None for tp in self.trackpoints)
        has_cadence = any(tp.cadence is not None for tp in self.trackpoints)
        has_power = any(tp.power_watts is not None for tp in self.trackpoints)
        return {
            "sourceFilename": self.source_filename,
            "sourceFileKind": self.source_file_kind,
            "activityId": self.activity_id,
            "sport": self.sport,
            "sportDetail": self.sport_detail,
            "startTime": to_utc_iso(self.start_time),
            "durationSeconds": self.duration_seconds,
            "distanceMeters": self.distance_meters,
            "calories": self.calories,
            "trackpointCount": len(self.trackpoints),
            "hasGps": has_gps,
            "hasHeartRate": has_hr,
            "hasCadence": has_cadence,
            "hasPower": has_power,
        }

    def to_export_dict(self) -> dict[str, Any]:
        summary = self.to_summary_dict()
        summary.update(
            {
                "source": self.source,
                "averageHeartRate": self.average_heart_rate,
                "maxHeartRate": self.max_heart_rate,
                "trackpoints": [trackpoint.to_dict() for trackpoint in self.trackpoints],
                "laps": [lap.to_dict() for lap in self.laps],
                "metadata": self.metadata,
            }
        )
        return summary


@dataclass
class ExportResult:
    filename: str
    mime_type: str
    content: bytes | str
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "filename": self.filename,
            "mimeType": self.mime_type,
            "content": self.content.decode("utf-8") if isinstance(self.content, bytes) else self.content,
            "warnings": self.warnings,
        }


def to_utc_iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def basename(path: str) -> str:
    normalized = path.replace("\\", "/").rstrip("/")
    return normalized.rsplit("/", 1)[-1] if "/" in normalized else normalized


def classification_status(kind: PolarFileKind, is_convertible: bool) -> str:
    if kind == PolarFileKind.INVALID_JSON:
        return "invalid"
    if kind in (PolarFileKind.ACCOUNT_DATA, PolarFileKind.ACCOUNT_PROFILE):
        return "skipped_sensitive"
    if is_convertible:
        return "ready"
    if kind in (
        PolarFileKind.ACTIVITY,
        PolarFileKind.OHR_SENSOR,
        PolarFileKind.PRODUCT_DEVICES,
        PolarFileKind.SLEEP_RESULTS,
        PolarFileKind.SPORT_PROFILES,
        PolarFileKind.CALENDAR_ITEMS,
    ):
        return "skipped_non_training"
    if kind in (PolarFileKind.UNKNOWN_JSON, PolarFileKind.NUMERIC_PREFIX_JSON):
        return "needs_analysis"
    return "skipped"
