from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from typing import Any

from .models import Activity, ExportResult, Lap, TrackPoint, to_utc_iso

TCX_NS = "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
XSI_NS = "http://www.w3.org/2001/XMLSchema-instance"

ET.register_namespace("", TCX_NS)
ET.register_namespace("xsi", XSI_NS)


class TcxExporter:
    mime_type = "application/vnd.garmin.tcx+xml"

    def export(self, activity: Activity) -> ExportResult:
        warnings: list[str] = []
        root = ET.Element(
            _tag("TrainingCenterDatabase"),
            {
                f"{{{XSI_NS}}}schemaLocation": (
                    "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 "
                    "http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd"
                )
            },
        )
        activities = ET.SubElement(root, _tag("Activities"))
        activity_node = ET.SubElement(activities, _tag("Activity"), {"Sport": activity.sport or "Other"})
        ET.SubElement(activity_node, _tag("Id")).text = to_utc_iso(activity.start_time)

        laps = activity.laps or [
            Lap(
                start_time=activity.start_time,
                total_time_seconds=activity.duration_seconds,
                distance_meters=activity.distance_meters,
                calories=activity.calories,
                average_heart_rate=activity.average_heart_rate,
                max_heart_rate=activity.max_heart_rate,
            )
        ]
        for lap in laps:
            self._append_lap(activity_node, lap, activity.trackpoints)

        if activity.sport_detail and activity.sport_detail != activity.sport:
            ET.SubElement(activity_node, _tag("Notes")).text = f"Polar sport: {activity.sport_detail}"

        if not activity.trackpoints:
            warnings.append("TCX nie zawiera trackpointów.")

        xml_bytes = ET.tostring(root, encoding="utf-8", xml_declaration=True)
        return ExportResult(
            filename=_tcx_filename(activity),
            mime_type=self.mime_type,
            content=xml_bytes.decode("utf-8"),
            warnings=warnings,
        )

    def _append_lap(self, parent: ET.Element, lap: Lap, trackpoints: list[TrackPoint]) -> None:
        lap_node = ET.SubElement(parent, _tag("Lap"), {"StartTime": to_utc_iso(lap.start_time)})
        _optional_text(lap_node, "TotalTimeSeconds", _format_float(lap.total_time_seconds))
        _optional_text(lap_node, "DistanceMeters", _format_float(_lap_distance(lap, trackpoints)))
        _optional_text(lap_node, "Calories", str(lap.calories) if lap.calories is not None else None)
        _heart_rate(lap_node, "AverageHeartRateBpm", lap.average_heart_rate)
        _heart_rate(lap_node, "MaximumHeartRateBpm", lap.max_heart_rate)
        ET.SubElement(lap_node, _tag("Intensity")).text = "Active"
        ET.SubElement(lap_node, _tag("TriggerMethod")).text = "Manual"

        if trackpoints:
            track_node = ET.SubElement(lap_node, _tag("Track"))
            for trackpoint in sorted(trackpoints, key=lambda item: item.time):
                self._append_trackpoint(track_node, trackpoint)

    def _append_trackpoint(self, parent: ET.Element, trackpoint: TrackPoint) -> None:
        point_node = ET.SubElement(parent, _tag("Trackpoint"))
        ET.SubElement(point_node, _tag("Time")).text = to_utc_iso(trackpoint.time)
        if trackpoint.latitude is not None and trackpoint.longitude is not None:
            position = ET.SubElement(point_node, _tag("Position"))
            ET.SubElement(position, _tag("LatitudeDegrees")).text = _format_float(trackpoint.latitude, precision=7)
            ET.SubElement(position, _tag("LongitudeDegrees")).text = _format_float(trackpoint.longitude, precision=7)
        _optional_text(point_node, "AltitudeMeters", _format_float(trackpoint.altitude_meters))
        _optional_text(point_node, "DistanceMeters", _format_float(trackpoint.distance_meters))
        _heart_rate(point_node, "HeartRateBpm", trackpoint.heart_rate)
        _optional_text(point_node, "Cadence", str(trackpoint.cadence) if trackpoint.cadence is not None else None)


def _tag(name: str) -> str:
    return f"{{{TCX_NS}}}{name}"


def _optional_text(parent: ET.Element, name: str, value: str | None) -> None:
    if value is not None:
        ET.SubElement(parent, _tag(name)).text = value


def _heart_rate(parent: ET.Element, name: str, value: int | None) -> None:
    if value is not None:
        node = ET.SubElement(parent, _tag(name))
        ET.SubElement(node, _tag("Value")).text = str(value)


def _format_float(value: float | None, precision: int = 3) -> str | None:
    if value is None:
        return None
    text = f"{value:.{precision}f}"
    return text.rstrip("0").rstrip(".") if "." in text else text


def _lap_distance(lap: Lap, trackpoints: list[TrackPoint]) -> float | None:
    distances = [tp.distance_meters for tp in trackpoints if tp.distance_meters is not None]
    if distances:
        return max(distances)
    return lap.distance_meters


def _tcx_filename(activity: Activity) -> str:
    timestamp = to_utc_iso(activity.start_time).replace("Z", "").replace("T", "_").replace(":", "-")[:16]
    sport = _slug(str(activity.metadata.get("polarSport") or activity.sport_detail or activity.sport or "activity"))
    identifier = _slug(activity.activity_id or activity.source_filename.rsplit(".", 1)[0])
    return f"{timestamp}_{sport}_{identifier}.tcx"


def _slug(value: str) -> str:
    stem = re.sub(r"[^A-Za-z0-9_.-]+", "-", value).strip("-").lower()
    return stem or "activity"
