import json

from converter.main import analyze_wellness_files, analyze_wellness_files_json


def wellness_result(filename: str, payload: dict):
    return analyze_wellness_files(
        [
            {
                "filename": filename,
                "jsonText": json.dumps(payload),
                "size": len(json.dumps(payload)),
                "mimeType": "application/json",
            }
        ]
    )


def test_daily_activity_steps_calories_and_active_time_are_normalized():
    result = wellness_result(
        "activity-2024-05-04.json",
        {"date": "2024-05-04", "steps": 12000, "calories": 2200, "activeMinutes": 85},
    )

    assert result["dailyActivity"][0]["date"] == "2024-05-04"
    assert result["dailyActivity"][0]["steps"] == 12000
    assert result["dailyActivity"][0]["calories"] == 2200
    assert result["dailyActivity"][0]["activeTimeMinutes"] == 85
    assert result["summary"]["dailyActivityDays"] == 1


def test_sleep_summary_is_normalized_without_fake_zeroes():
    result = wellness_result(
        "sleep-results-2024-05-05.json",
        {
            "sleepStart": "2024-05-04T22:15:00Z",
            "sleepEnd": "2024-05-05T06:05:00Z",
            "durationMinutes": 470,
            "sleepScore": 82,
        },
    )

    sleep = result["sleepSummaries"][0]
    assert sleep["date"] == "2024-05-05"
    assert sleep["sleepScore"] == 82
    assert sleep["durationMinutes"] == 470
    assert sleep["actualSleepMinutes"] is None
    assert sleep["deepSleepMinutes"] is None
    assert result["summary"]["sleepNights"] == 1


def test_sleep_stages_are_exported_when_available():
    result = wellness_result(
        "sleep-results-2024-05-05.json",
        {
            "sleepStart": "2024-05-04T22:00:00Z",
            "sleepEnd": "2024-05-05T06:00:00Z",
            "sleepScore": 80,
            "sleepStages": [
                {
                    "stage": "deep",
                    "startTime": "2024-05-04T23:00:00Z",
                    "endTime": "2024-05-04T23:45:00Z",
                    "durationMinutes": 45,
                }
            ],
        },
    )

    assert result["sleepStages"][0]["date"] == "2024-05-04"
    assert result["sleepStages"][0]["stage"] == "deep"
    assert result["sleepStages"][0]["durationMinutes"] == 45
    assert result["summary"]["sleepStageRecords"] == 1


def test_nightly_recharge_and_daily_hr_are_normalized():
    result = wellness_result(
        "nightly_recovery_2024-05-05.json",
        {
            "date": "2024-05-05",
            "nightlyRecharge": {"status": "good"},
            "ansCharge": 3.1,
            "hrv": 62,
            "breathingRate": 13.4,
            "restingHeartRate": 48,
        },
    )

    nightly = result["nightlyRecharge"][0]
    assert nightly["date"] == "2024-05-05"
    assert nightly["rechargeStatus"] == "good"
    assert nightly["ansCharge"] == 3.1
    assert nightly["hrvMs"] == 62
    assert nightly["breathingRate"] == 13.4
    assert result["dailyHeartRate"][0]["restingHeartRate"] == 48


def test_heart_rate_samples_are_aggregated_by_day():
    result = wellness_result(
        "247-ohr_2024-05-05.json",
        {
            "samples": [
                {"time": "2024-05-05T08:00:00Z", "heartRate": 50},
                {"time": "2024-05-05T08:01:00Z", "heartRate": 70},
            ]
        },
    )

    heart_rate = result["dailyHeartRate"][0]
    assert heart_rate["date"] == "2024-05-05"
    assert heart_rate["averageHeartRate"] == 60
    assert heart_rate["minHeartRate"] == 50
    assert heart_rate["maxHeartRate"] == 70


def test_ohr_device_days_are_exported_per_day_not_as_one_file_record():
    result = wellness_result(
        "247ohr_2024.json",
        {
            "deviceDays": [
                {
                    "date": "2024-05-05",
                    "samples": [
                        {"heartRate": 50, "secondsFromDayStart": 1},
                        {"heartRate": 70, "secondsFromDayStart": 2},
                    ],
                },
                {
                    "date": "2024-05-06",
                    "samples": [
                        {"heartRate": 60, "secondsFromDayStart": 1},
                        {"heartRate": 80, "secondsFromDayStart": 2},
                    ],
                },
            ]
        },
    )

    assert result["summary"]["dailyHeartRateDays"] == 2
    assert [item["date"] for item in result["dailyHeartRate"]] == ["2024-05-05", "2024-05-06"]
    assert result["dailyHeartRate"][0]["averageHeartRate"] == 60
    assert result["dailyHeartRate"][1]["averageHeartRate"] == 70


def test_sleep_result_score_and_nightly_recovery_lists_merge_without_undated_noise():
    result = analyze_wellness_files(
        [
            {
                "filename": "sleep_result.json",
                "jsonText": json.dumps(
                    [
                        {
                            "night": "2024-05-05",
                            "evaluation": {"sleepSpan": "PT8H", "asleepDuration": "PT7H30M"},
                            "sleepResult": {
                                "hypnogram": {
                                    "sleepStart": "2024-05-04T22:00:00Z",
                                    "sleepEnd": "2024-05-05T06:00:00Z",
                                }
                            },
                        }
                    ]
                ),
            },
            {
                "filename": "sleep_score.json",
                "jsonText": json.dumps(
                    [
                        {
                            "night": "2024-05-05",
                            "sleepScoreResult": {"sleepScore": 82, "continuityScore": 71},
                            "sleepScoreBaselines": {"sleepTimeAverageMinutes": 440},
                        }
                    ]
                ),
            },
            {
                "filename": "nightly_recovery.json",
                "jsonText": json.dumps(
                    [
                        {
                            "night": "2024-05-05",
                            "ansRate": 3.2,
                            "meanNightlyRecoveryRmssd": 62,
                            "meanNightlyRecoveryRespirationInterval": 4200,
                        }
                    ]
                ),
            },
        ]
    )

    assert result["summary"]["sleepNights"] == 1
    assert result["sleepSummaries"][0]["sleepScore"] == 82
    assert result["sleepSummaries"][0]["durationMinutes"] == 480
    assert result["sleepSummaries"][0]["actualSleepMinutes"] == 450
    assert result["summary"]["nightlyRechargeDays"] == 1
    assert result["nightlyRecharge"][0]["hrvMs"] == 62
    assert result["undatedRecords"] == []


def test_calendar_physical_information_is_not_daily_heart_rate():
    result = wellness_result(
        "calendar-items.json",
        {
            "physicalInformations": [
                {
                    "dateTime": "2024-05-05T12:00:00Z",
                    "maximumHeartRate": 190,
                    "restingHeartRate": 50,
                }
            ]
        },
    )

    assert result["dailyHeartRate"] == []


def test_multiple_files_for_same_day_merge_with_conflict_warning():
    result = analyze_wellness_files(
        [
            {"filename": "activity-a.json", "jsonText": json.dumps({"date": "2024-05-04", "steps": 1000})},
            {"filename": "activity-b.json", "jsonText": json.dumps({"date": "2024-05-04", "steps": 1500})},
        ]
    )

    daily = result["dailyActivity"][0]
    assert daily["steps"] == 1000
    assert daily["sourceFiles"] == ["activity-a.json", "activity-b.json"]
    assert "Konflikt pola steps" in daily["warnings"][0]


def test_undated_records_stay_in_normalized_json_but_not_summary_counts():
    result = wellness_result("activity-undated.json", {"steps": 1000})

    assert result["dailyActivity"] == []
    assert result["undatedRecords"][0]["recordType"] == "daily_activity"
    assert result["summary"]["dailyActivityDays"] == 0
    assert "Brak daty" in result["warnings"][0]


def test_account_files_are_skipped_for_wellness_analysis():
    result = wellness_result("account-data.json", {"email": "user@example.com", "date": "2024-05-04", "steps": 1})

    assert result["dailyActivity"] == []
    assert result["skippedRecords"][0]["recordType"] == "account_data"


def test_json_api_returns_browser_json():
    payload = json.dumps([{"filename": "activity.json", "jsonText": json.dumps({"date": "2024-05-04", "steps": 1})}])

    result = json.loads(analyze_wellness_files_json(payload))

    assert result["dailyActivity"][0]["steps"] == 1
