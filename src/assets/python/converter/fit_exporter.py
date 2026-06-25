from __future__ import annotations

from .models import Activity, ExportResult


class FitExporter:
    def export(self, activity: Activity) -> ExportResult:
        return ExportResult(
            filename=f"{activity.source_filename.rsplit('.', 1)[0]}.fit",
            mime_type="application/vnd.ant.fit",
            content="",
            warnings=["Eksport FIT nie jest dostępny w tym trybie. Użyj TCX."],
        )
