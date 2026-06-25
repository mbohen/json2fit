from __future__ import annotations

import re
from typing import Any, Iterable

from .models import PolarFileCategory, PolarFileClassification, PolarFileKind
from .schema_detector import detect_training_structure, normalized_key


TRAINING_CONTENT_KEYS = {
    "sport",
    "exercise",
    "training",
    "session",
    "samples",
    "route",
    "heartrate",
    "duration",
    "distance",
}
DAILY_ACTIVITY_CONTENT_KEYS = {
    "steps",
    "activetime",
    "activeminutes",
    "calories",
    "activitygoal",
    "dailyactivity",
    "date",
}
SLEEP_WELLNESS_CONTENT_KEYS = {
    "sleep",
    "sleepstart",
    "sleepend",
    "sleepscore",
    "nightlyrecharge",
    "ans",
    "hrv",
    "hypnogram",
    "sleepstages",
    "continuity",
}
ACCOUNT_CONTENT_KEYS = {
    "email",
    "firstname",
    "lastname",
    "profile",
    "account",
    "birthdate",
    "gender",
    "settings",
}


def classify_polar_file(
    filename: str,
    json_data: dict | list | None = None,
    size_bytes: int = 0,
) -> PolarFileClassification:
    lower_name = filename.lower()

    if not lower_name.endswith(".json"):
        return _classification(
            filename=filename,
            kind=PolarFileKind.UNSUPPORTED,
            category=PolarFileCategory.IGNORED_NON_JSON,
            is_convertible=False,
            reason="Obsługiwane są tylko pliki JSON.",
            warnings=["Plik nie ma rozszerzenia .json."],
            confidence="high",
            size_bytes=size_bytes,
        )

    if json_data is None:
        return _classification(
            filename=filename,
            kind=PolarFileKind.INVALID_JSON,
            category=PolarFileCategory.INVALID_JSON,
            is_convertible=False,
            reason="Nie udało się sparsować JSON.",
            warnings=["Plik jest niepoprawnym JSON-em albo nie został wczytany."],
            confidence="low",
            size_bytes=size_bytes,
        )

    kind = _kind_from_name(lower_name)
    detected_keys = _detected_keys(json_data)
    content_category = _category_from_detected_keys(detected_keys)
    structure = detect_training_structure(json_data)
    warnings = structure.warnings.copy()

    if kind == PolarFileKind.ACCOUNT_DATA:
        return _classification(
            filename=filename,
            kind=kind,
            category=PolarFileCategory.ACCOUNT_DATA,
            is_convertible=False,
            reason="Dane konta — pominięte.",
            warnings=["Plik może zawierać dane osobowe i nie jest analizowany jako trening."],
            confidence="high",
            detected_keys=detected_keys,
            size_bytes=size_bytes,
        )

    if kind == PolarFileKind.ACCOUNT_PROFILE:
        return _classification(
            filename=filename,
            kind=kind,
            category=PolarFileCategory.ACCOUNT_DATA,
            is_convertible=False,
            reason="Profil konta — pominięty.",
            warnings=["Plik może zawierać dane profilu i nie jest analizowany jako trening."],
            confidence="high",
            detected_keys=detected_keys,
            size_bytes=size_bytes,
        )

    if kind == PolarFileKind.TRAINING_SESSION:
        if structure.looks_like_training:
            return _classification(
                filename=filename,
                kind=kind,
                category=PolarFileCategory.TRAINING_SESSION,
                is_convertible=True,
                reason="Wykryto sesję treningową z osią czasu.",
                warnings=[],
                confidence="high",
                detected_keys=detected_keys,
                size_bytes=size_bytes,
            )
        return _classification(
            filename=filename,
            kind=kind,
            category=PolarFileCategory.TRAINING_SESSION,
            is_convertible=False,
            reason="Plik wygląda na sesję treningową, ale brakuje danych wymaganych do TCX.",
            warnings=warnings,
            confidence="medium",
            detected_keys=detected_keys,
            size_bytes=size_bytes,
        )

    if kind == PolarFileKind.ACTIVITY:
        return _classification(
            filename=filename,
            kind=kind,
            category=PolarFileCategory.DAILY_ACTIVITY,
            is_convertible=False,
            reason="Aktywność dzienna — poza eksportem sportowym.",
            warnings=["Pliki activity nie są automatycznie konwertowane bez potwierdzonej struktury treningu."],
            confidence="high",
            detected_keys=detected_keys,
            size_bytes=size_bytes,
        )

    if kind == PolarFileKind.OHR_SENSOR:
        return _classification(
            filename=filename,
            kind=kind,
            category=PolarFileCategory.SLEEP_OR_WELLNESS,
            is_convertible=False,
            reason="Dane OHR/wellness — poza eksportem sportowym.",
            warnings=["Plik wygląda na pomocnicze dane sensora tętna, nie samodzielną aktywność treningową."],
            confidence="high",
            detected_keys=detected_keys,
            size_bytes=size_bytes,
        )

    if kind == PolarFileKind.PRODUCT_DEVICES:
        return _classification(
            filename=filename,
            kind=kind,
            category=PolarFileCategory.UNKNOWN_JSON,
            is_convertible=False,
            reason="Dane urządzeń — pominięte.",
            warnings=["Plik zawiera metadane urządzeń, nie trening."],
            confidence="high",
            detected_keys=detected_keys,
            size_bytes=size_bytes,
        )

    if kind == PolarFileKind.SLEEP_RESULTS:
        return _classification(
            filename=filename,
            kind=kind,
            category=PolarFileCategory.SLEEP_OR_WELLNESS,
            is_convertible=False,
            reason="Dane snu/wellness — pominięte.",
            warnings=["Plik zawiera wyniki snu lub regeneracji, nie aktywność sportową do Garmin Connect."],
            confidence="high",
            detected_keys=detected_keys,
            size_bytes=size_bytes,
        )

    if kind == PolarFileKind.SPORT_PROFILES:
        return _classification(
            filename=filename,
            kind=kind,
            category=PolarFileCategory.UNKNOWN_JSON,
            is_convertible=False,
            reason="Profile sportowe — pominięte.",
            warnings=["Plik zawiera konfigurację profili sportowych, nie pojedynczą sesję treningową."],
            confidence="high",
            detected_keys=detected_keys,
            size_bytes=size_bytes,
        )

    if kind == PolarFileKind.CALENDAR_ITEMS:
        return _classification(
            filename=filename,
            kind=kind,
            category=PolarFileCategory.UNKNOWN_JSON,
            is_convertible=False,
            reason="Elementy kalendarza — pominięte.",
            warnings=["Plik zawiera wpisy kalendarza i pomiary pomocnicze, nie pojedynczą aktywność sportową."],
            confidence="high",
            detected_keys=detected_keys,
            size_bytes=size_bytes,
        )

    if kind == PolarFileKind.NUMERIC_PREFIX_JSON:
        category = content_category or PolarFileCategory.UNKNOWN_NUMERIC
        is_convertible = category == PolarFileCategory.TRAINING_SESSION and structure.looks_like_training
        return _classification(
            filename=filename,
            kind=kind,
            category=category,
            is_convertible=is_convertible,
            reason=_heuristic_reason(category, is_convertible, "Numeryczny plik JSON"),
            warnings=_heuristic_warnings(category, is_convertible, warnings),
            confidence="medium" if content_category else "low",
            detected_keys=detected_keys,
            size_bytes=size_bytes,
        )

    category = content_category or PolarFileCategory.UNKNOWN_JSON
    is_convertible = category == PolarFileCategory.TRAINING_SESSION and structure.looks_like_training
    return _classification(
        filename=filename,
        kind=PolarFileKind.UNKNOWN_JSON,
        category=category,
        is_convertible=is_convertible,
        reason=_heuristic_reason(category, is_convertible, "Nieznany plik JSON"),
        warnings=_heuristic_warnings(category, is_convertible, warnings),
        confidence="medium" if content_category else "low",
        detected_keys=detected_keys,
        size_bytes=size_bytes,
    )


def _classification(
    *,
    filename: str,
    kind: PolarFileKind,
    category: PolarFileCategory,
    is_convertible: bool,
    reason: str,
    warnings: list[str],
    confidence: str,
    size_bytes: int,
    detected_keys: list[str] | None = None,
) -> PolarFileClassification:
    return PolarFileClassification(
        filename=filename,
        path=filename,
        size_bytes=size_bytes,
        kind=kind,
        category=category,
        is_convertible=is_convertible,
        reason=reason,
        warnings=_unique_messages(warnings),
        confidence=confidence,
        detected_keys=detected_keys or [],
    )


def _kind_from_name(lower_name: str) -> PolarFileKind:
    basename = lower_name.rsplit("/", 1)[-1]
    if (
        basename.startswith("training-session")
        or basename.startswith("training-sesison")
        or basename.startswith("trening-session")
        or basename.startswith("trening-sesison")
    ):
        return PolarFileKind.TRAINING_SESSION
    if basename.startswith("activity"):
        return PolarFileKind.ACTIVITY
    if basename.startswith("account-data"):
        return PolarFileKind.ACCOUNT_DATA
    if basename.startswith("account-profile"):
        return PolarFileKind.ACCOUNT_PROFILE
    if (
        basename.startswith("247-ohr_")
        or basename.startswith("247-ohr-")
        or basename.startswith("247ohr_")
        or basename.startswith("ppi_samples")
    ):
        return PolarFileKind.OHR_SENSOR
    if (
        basename.startswith("product_devices")
        or basename.startswith("product-devices")
        or basename.startswith("products-devices")
    ):
        return PolarFileKind.PRODUCT_DEVICES
    if (
        basename.startswith("sleep-results")
        or basename.startswith("sleep_result")
        or basename.startswith("sleep_score")
        or basename.startswith("nightly_recovery")
    ):
        return PolarFileKind.SLEEP_RESULTS
    if basename.startswith("sport-profiles"):
        return PolarFileKind.SPORT_PROFILES
    if basename.startswith("calendar-items"):
        return PolarFileKind.CALENDAR_ITEMS
    if re.match(r"^\d+.*\.json$", basename):
        return PolarFileKind.NUMERIC_PREFIX_JSON
    return PolarFileKind.UNKNOWN_JSON


def _detected_keys(data: Any) -> list[str]:
    known = TRAINING_CONTENT_KEYS | DAILY_ACTIVITY_CONTENT_KEYS | SLEEP_WELLNESS_CONTENT_KEYS | ACCOUNT_CONTENT_KEYS
    matches: list[str] = []
    seen: set[str] = set()
    for key in _walk_keys(data):
        normalized = normalized_key(key)
        if normalized not in known or normalized in seen:
            continue
        matches.append(key)
        seen.add(normalized)
    matches.sort(key=lambda item: item.lower())
    return matches


def _category_from_detected_keys(keys: list[str]) -> PolarFileCategory | None:
    normalized = {normalized_key(key) for key in keys}
    scores = {
        PolarFileCategory.TRAINING_SESSION: len(normalized & TRAINING_CONTENT_KEYS),
        PolarFileCategory.DAILY_ACTIVITY: len(normalized & DAILY_ACTIVITY_CONTENT_KEYS),
        PolarFileCategory.SLEEP_OR_WELLNESS: len(normalized & SLEEP_WELLNESS_CONTENT_KEYS),
        PolarFileCategory.ACCOUNT_DATA: len(normalized & ACCOUNT_CONTENT_KEYS),
    }
    category, score = max(scores.items(), key=lambda item: item[1])
    if score <= 0:
        return None
    if category == PolarFileCategory.TRAINING_SESSION and score < 2:
        return None
    return category


def _heuristic_reason(category: PolarFileCategory, is_convertible: bool, prefix: str) -> str:
    if category == PolarFileCategory.TRAINING_SESSION:
        if is_convertible:
            return f"{prefix}: heurystyka po zawartości wykryła jednoznaczną strukturę treningu."
        return f"{prefix}: heurystyka po zawartości wskazuje trening, ale brakuje danych wymaganych do eksportu."
    if category == PolarFileCategory.DAILY_ACTIVITY:
        return f"{prefix}: heurystyka po zawartości wskazuje aktywność dzienną."
    if category == PolarFileCategory.SLEEP_OR_WELLNESS:
        return f"{prefix}: heurystyka po zawartości wskazuje sen lub wellness."
    if category == PolarFileCategory.ACCOUNT_DATA:
        return f"{prefix}: heurystyka po zawartości wskazuje dane konta; plik pominięty."
    return f"{prefix} wymaga analizy."


def _heuristic_warnings(category: PolarFileCategory, is_convertible: bool, warnings: list[str]) -> list[str]:
    if is_convertible:
        return []
    if category in (
        PolarFileCategory.DAILY_ACTIVITY,
        PolarFileCategory.SLEEP_OR_WELLNESS,
        PolarFileCategory.ACCOUNT_DATA,
    ):
        return []
    return warnings


def _walk_keys(data: Any) -> Iterable[str]:
    if isinstance(data, dict):
        for key, value in data.items():
            yield key
            yield from _walk_keys(value)
    elif isinstance(data, list):
        for item in data:
            yield from _walk_keys(item)


def _unique_messages(messages: list[str]) -> list[str]:
    unique: list[str] = []
    seen: set[str] = set()
    for message in messages:
        if not message or message in seen:
            continue
        unique.append(message)
        seen.add(message)
    return unique
